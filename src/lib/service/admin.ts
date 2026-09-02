import "server-only";

import { randomUUID } from "node:crypto";

import { serverConfig } from "../config";
import { getRepository } from "../db";
import type { ModerationAction } from "../db/types";
import { makeEvent } from "../domain/events";
import { decideIntake, isOperatorPresent, releaseTimestamp } from "../domain/policy";
import { countGraphemes, sanitizeText } from "../domain/sanitize";
import { countAvailablePhrases, pickSyntheticPhrases } from "../domain/syntheticPhrases";
import {
  toModerationMessage,
  type ModerationMessage,
  type ModerationMode,
} from "../domain/types";
import { publishEvent } from "../realtime/publish";
import { resolveEvent } from "./messages";

export interface AdminSnapshot {
  event: {
    slug: string;
    name: string;
    moderationMode: ModerationMode;
    status: string;
    /** Effettiva: gia' risolta al default applicativo se l'admin non l'ha impostata. */
    closingPhrase: string;
  };
  pending: ModerationMessage[];
  stats: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    /**
     * Quanti messaggi sono davvero eleggibili per il display ora: a
     * differenza di `approved` (cumulativo), tiene conto del panic button.
     * E' la risposta a "quante frasi stanno ruotando".
     */
    rotating: number;
  };
  /** Quanto manca prima che il sistema si consideri non presidiato. */
  operatorTimeoutMs: number;
  /** Quante frasi pre-scritte restano da poter aggiungere senza ripeterne una. */
  syntheticAvailable: number;
}

/**
 * Coda di moderazione.
 *
 * Registra anche l'heartbeat dell'operatore: la pagina /admin interroga
 * questa route di continuo, quindi la presenza umana e' semplicemente il
 * fatto che qualcuno stia guardando. Nessun endpoint dedicato, nessuno stato
 * da tenere allineato, e non c'e' modo di dichiararsi presenti senza esserlo.
 */
export async function getAdminSnapshot(eventSlug: string): Promise<AdminSnapshot> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);

  const now = new Date().toISOString();
  await repo.touchOperator(event.id, now);

  const [pending, stats, rotating, usedSynthetic] = await Promise.all([
    repo.listByStatus(event.id, "pending", 100),
    repo.stats(event.id),
    repo.countRotating(event.id, event.clearedAt, now),
    repo.listBodiesBySource(event.id, "synthetic"),
  ]);

  return {
    event: {
      slug: event.slug,
      name: event.name,
      moderationMode: event.moderationMode,
      status: event.status,
      closingPhrase: event.closingPhrase ?? serverConfig.event.closingPhrase,
    },
    pending: pending.map(toModerationMessage),
    stats: { ...stats, rotating },
    operatorTimeoutMs: serverConfig.moderation.operatorTimeoutMs,
    syntheticAvailable: countAvailablePhrases(usedSynthetic),
  };
}

export interface ReviewSnapshot {
  approved: ModerationMessage[];
  rejected: ModerationMessage[];
}

/**
 * Messaggi gia' decisi (approvati e bloccati), per la pagina di revisione:
 * serve a correggere un errore gia' fatto, non a moderarne uno nuovo.
 *
 * Registra anch'essa l'heartbeat: chi sta correggendo un errore da qui e'
 * un operatore presente esattamente come chi lavora dalla coda principale.
 */
export async function getReviewSnapshot(eventSlug: string): Promise<ReviewSnapshot> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  await repo.touchOperator(event.id, new Date().toISOString());

  const limit = serverConfig.moderation.reviewListLimit;
  const [approved, rejected] = await Promise.all([
    repo.listByStatus(event.id, "approved", limit),
    repo.listByStatus(event.id, "rejected", limit),
  ]);

  // Piu' recenti prima: chi apre questa pagina vuole vedere cosa e' appena
  // successo, non l'inizio della serata.
  return {
    approved: approved.map(toModerationMessage).reverse(),
    rejected: rejected.map(toModerationMessage).reverse(),
  };
}

/**
 * Aggiunge un lotto di frasi pre-scritte (`syntheticPhrases.ts`) quando il
 * moderatore ritiene che la rotazione sul display sia troppo scarna.
 *
 * Passano dalla stessa `decideIntake` di un messaggio reale, con verdetto
 * `clean` fisso: sono pre-vagliate, quindi non serve rivalutarle. Chi preme
 * il pulsante ha per forza /admin aperto, quindi in `manual`/`assisted`
 * l'operatore risulta presente e le frasi vanno comunque in coda con un tap
 * (nessuna scorciatoia rispetto a un messaggio reale "clean"); solo in `auto`
 * saltano dritte a schermo.
 */
export async function addSyntheticMessages(
  eventSlug: string,
  count: number,
): Promise<{ added: number; available: number }> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  const operatorPresent = isOperatorPresent(event.operatorLastSeenAt);

  const used = await repo.listBodiesBySource(event.id, "synthetic");
  const phrases = pickSyntheticPhrases(used, count);

  let anyApproved = false;
  for (const phrase of phrases) {
    const decision = decideIntake({
      mode: event.moderationMode,
      verdict: "clean",
      operatorPresent,
    });
    const approved = decision.status === "approved";

    const { created } = await repo.insertMessage({
      eventId: event.id,
      body: phrase.body,
      authorName: phrase.name,
      status: decision.status === "rejected" ? "rejected" : decision.status,
      filterVerdict: "clean",
      rejectReason: null,
      releasedAt: approved ? releaseTimestamp("auto") : null,
      moderatedBy: decision.status === "pending" ? null : "auto",
      ipHash: "synthetic",
      sessionId: randomUUID(),
      clientMsgId: randomUUID(),
      source: "synthetic",
    });
    if (approved && created) anyApproved = true;
  }

  if (anyApproved) {
    await publishEvent(event.slug, makeEvent("message.created", {}));
  }

  const available = countAvailablePhrases([...used, ...phrases.map((p) => p.body)]);
  return { added: phrases.length, available };
}

export async function moderateMessage(
  eventSlug: string,
  id: string,
  action: ModerationAction,
): Promise<{ ok: boolean }> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  const at = new Date().toISOString();

  const updated = await repo.moderate({
    id,
    action,
    by: "operator",
    at,
    // Una decisione umana non ha bisogno della finestra di sicurezza: la
    // valutazione e' appena avvenuta. Va a schermo subito.
    releasedAt: action === "approve" ? releaseTimestamp("operator") : null,
  });
  if (!updated) return { ok: false };

  await repo.touchOperator(event.id, at);

  if (action === "approve") {
    await publishEvent(event.slug, makeEvent("message.approved", {}));
  } else {
    // `removed` fa sparire il messaggio dallo schermo all'istante, anche se e'
    // gia' in onda: e' il motivo per cui esiste come azione separata.
    await publishEvent(
      event.slug,
      action === "remove"
        ? makeEvent("message.removed", { id })
        : makeEvent("message.rejected", { id }),
    );
  }

  return { ok: true };
}

export async function setModerationMode(
  eventSlug: string,
  mode: ModerationMode,
): Promise<void> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  await repo.setModerationMode(event.id, mode);
}

export type SetClosingPhraseResult =
  | { ok: true }
  | { ok: false; error: "too_long" };

/**
 * Imposta la frase della schermata di chiusura. Una frase vuota (o solo
 * spazi) riporta il default applicativo, invece di salvare una frase vuota
 * che lascerebbe lo schermo di chiusura senza niente da mostrare.
 *
 * Stessa sanitizzazione del messaggio del pubblico: anche questa frase finisce
 * da sola, enorme, su uno schermo di 6 metri. Il limite e' in grafemi, non
 * caratteri UTF-16, per lo stesso motivo del corpo del messaggio: contarli
 * diversamente sul client e sul server produrrebbe un rifiuto che qui non
 * potrebbe nemmeno succedere, visto che il client blocca il Salva prima.
 */
export async function setClosingPhrase(
  eventSlug: string,
  phrase: string,
): Promise<SetClosingPhraseResult> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  const trimmed = sanitizeText(phrase);
  if (countGraphemes(trimmed) > serverConfig.limits.closingPhraseMaxLength) {
    return { ok: false, error: "too_long" };
  }
  await repo.setClosingPhrase(event.id, trimmed.length > 0 ? trimmed : null);
  return { ok: true };
}

/** Panic button: svuota lo schermo adesso e impedisce il ritorno dello storico. */
export async function clearDisplay(eventSlug: string): Promise<void> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  const at = new Date().toISOString();

  await repo.clearDisplay(event.id, at);
  await publishEvent(event.slug, makeEvent("display.clear", {}));
}

/**
 * Chiude la serata: da questo momento il display mostra la schermata di
 * chiusura fissa e non torna piu' alla rotazione dei messaggi. Definitivo
 * quanto il panic button, ma non e' un'emergenza: e' la fine programmata.
 */
export async function closeEvent(eventSlug: string): Promise<void> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  const at = new Date().toISOString();

  await repo.endEvent(event.id, at);
  await publishEvent(event.slug, makeEvent("event.ended", {}));
}

/**
 * Riapre una serata chiusa per errore o per provare la schermata di
 * chiusura in anteprima: non tocca i messaggi, solo lo stato dell'evento.
 * Il display torna alla rotazione da solo al prossimo poll.
 */
export async function reopenEvent(eventSlug: string): Promise<void> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);

  await repo.reopenEvent(event.id);
  await publishEvent(event.slug, makeEvent("event.started", {}));
}

/**
 * Cancella tutti i messaggi dell'evento. Distruttiva e irreversibile: serve
 * a ripulire i messaggi di prova (es. il pomeriggio del concerto, dopo aver
 * verificato che tutto funzioni) senza portarseli dietro a schermo la sera.
 *
 * Riapre anche l'evento se era stato chiuso: un reset serve a ripartire da
 * zero, e "zero messaggi ma display bloccato sulla schermata di chiusura"
 * non e' uno stato iniziale — resterebbe li' finche' qualcuno non tocca
 * anche "Riapri la serata" altrove, senza un motivo per doverlo fare in due
 * passaggi separati.
 */
export async function purgeMessages(eventSlug: string): Promise<number> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  const deleted = await repo.deleteAllMessages(event.id);
  await repo.clearDisplay(event.id, new Date().toISOString());
  if (event.status === "ended") {
    await repo.reopenEvent(event.id);
    await publishEvent(event.slug, makeEvent("event.started", {}));
  }
  await publishEvent(event.slug, makeEvent("display.clear", {}));
  return deleted;
}

/** Telemetria: quali messaggi sono davvero andati a schermo. Non e' critica. */
export async function markDisplayed(ids: readonly string[]): Promise<void> {
  await getRepository().markDisplayed(ids, new Date().toISOString());
}

export async function operatorPresence(eventSlug: string): Promise<boolean> {
  const event = await resolveEvent(eventSlug);
  return isOperatorPresent(event.operatorLastSeenAt);
}
