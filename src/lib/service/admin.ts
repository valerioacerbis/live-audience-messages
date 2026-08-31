import "server-only";

import { randomUUID } from "node:crypto";

import { serverConfig } from "../config";
import { getRepository } from "../db";
import type { ModerationAction } from "../db/types";
import { makeEvent } from "../domain/events";
import { decideIntake, isOperatorPresent, releaseTimestamp } from "../domain/policy";
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
    },
    pending: pending.map(toModerationMessage),
    stats: { ...stats, rotating },
    operatorTimeoutMs: serverConfig.moderation.operatorTimeoutMs,
    syntheticAvailable: countAvailablePhrases(usedSynthetic),
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
