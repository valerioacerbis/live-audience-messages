import "server-only";

import { serverConfig } from "../config";
import { getRepository } from "../db";
import type { ModerationAction } from "../db/types";
import { makeEvent } from "../domain/events";
import { isOperatorPresent, releaseTimestamp } from "../domain/policy";
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
  stats: { total: number; approved: number; pending: number; rejected: number };
  /** Quanto manca prima che il sistema si consideri non presidiato. */
  operatorTimeoutMs: number;
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

  await repo.touchOperator(event.id, new Date().toISOString());

  const [pending, stats] = await Promise.all([
    repo.listByStatus(event.id, "pending", 100),
    repo.stats(event.id),
  ]);

  return {
    event: {
      slug: event.slug,
      name: event.name,
      moderationMode: event.moderationMode,
      status: event.status,
    },
    pending: pending.map(toModerationMessage),
    stats,
    operatorTimeoutMs: serverConfig.moderation.operatorTimeoutMs,
  };
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
 * Cancella tutti i messaggi dell'evento. Distruttiva e irreversibile: serve
 * a ripulire i messaggi di prova (es. il pomeriggio del concerto, dopo aver
 * verificato che tutto funzioni) senza portarseli dietro a schermo la sera.
 */
export async function purgeMessages(eventSlug: string): Promise<number> {
  const repo = getRepository();
  const event = await resolveEvent(eventSlug);
  const deleted = await repo.deleteAllMessages(event.id);
  await repo.clearDisplay(event.id, new Date().toISOString());
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
