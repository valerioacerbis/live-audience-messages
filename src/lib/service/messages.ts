import "server-only";

import { randomUUID } from "node:crypto";

import { serverConfig } from "../config";
import { getRepository } from "../db";
import type { Repository } from "../db/types";
import { makeEvent } from "../domain/events";
import {
  NORMALIZE_ERROR_MESSAGES,
  normalizeMessage,
  type CreateMessageInput,
} from "../domain/message.schema";
import { filterMessage } from "../domain/moderation";
import { decideIntake, isOperatorPresent, releaseTimestamp } from "../domain/policy";
import { toPublicMessage, type EventRecord, type PublicMessage } from "../domain/types";
import { publishEvent } from "../realtime/publish";
import { checkRateLimit, RATE_LIMIT_MESSAGES } from "../ratelimit";

/**
 * Business logic dei messaggi.
 *
 * Sta qui e non nelle route perche' le route devono occuparsi solo di HTTP.
 * Il vantaggio pratico si vede nello script di burst test, che chiama queste
 * funzioni direttamente senza passare dalla rete.
 */

export interface CreateResult {
  status: number;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Evento da pubblicare dopo aver risposto, se c'e'. */
  publish?: { slug: string; type: "message.created" };
}

export async function resolveEvent(slug: string): Promise<EventRecord> {
  const repo = getRepository();
  return repo.ensureEvent(slug, serverConfig.event.name, "assisted");
}

/**
 * Risposta usata sia in caso di successo sia quando il messaggio viene
 * scartato in silenzio.
 *
 * L'utente non deve mai sapere se e' finito in coda, e' stato rifiutato o e'
 * gia' a schermo: se lo sapesse, riproverebbe finche' non aggira il filtro.
 * E chi ha scritto qualcosa di normale non merita di vedersi dire "bloccato".
 */
function accepted(id: string): CreateResult {
  return { status: 200, body: { ok: true, id, status: "received" } };
}

export async function createMessage(
  input: CreateMessageInput,
  context: { ipHash: string },
): Promise<CreateResult> {
  // Bot pigri: honeypot compilato o invio troppo rapido per un umano.
  // Rispondiamo come se fosse tutto a posto, cosi' non imparano niente.
  if (input.hp || input.elapsedMs < serverConfig.minSubmitMs) {
    return accepted(randomUUID());
  }

  const normalized = normalizeMessage(input.body, input.name);
  if (!normalized.ok) {
    return { status: 400, body: { ok: false, message: NORMALIZE_ERROR_MESSAGES[normalized.error] } };
  }

  const repo = getRepository();
  const event = await resolveEvent(input.eventSlug);

  if (event.status === "ended") {
    return { status: 403, body: { ok: false, message: "L'evento e' terminato. Grazie!" } };
  }

  /**
   * Idempotenza PRIMA del rate limit.
   *
   * Un rinvio dello stesso messaggio non e' un messaggio nuovo. Con i
   * controlli nell'ordine opposto, chi ritocca INVIA perche' la risposta si
   * e' persa — lo scenario piu' probabile su una rete di locale — riceverebbe
   * "aspetta un attimo" invece della conferma, e ci riproverebbe ancora.
   * Costa una query indicizzata e rende la garanzia incondizionata.
   *
   * Sequenziale e non in parallelo col rate limit: provato in parallelo nel
   * test di carico del 2026-09-01 (Blocco F in NEXT_STEPS.md), il p50 e'
   * sceso ma il p95 e' salito da 6.6s a 10.8s — su un database a CPU
   * condivisa la concorrenza in piu' e' costata piu' del round trip
   * risparmiato. Non ripetere senza prima strumentare la causa.
   */
  const already = await repo.findByClientMsgId(event.id, input.clientMsgId);
  if (already) return accepted(already.id);

  const limit = await checkRateLimit(repo, {
    eventId: event.id,
    ipHash: context.ipHash,
    sessionId: input.sessionId,
  });
  if (!limit.allowed && limit.scope) {
    return {
      status: 429,
      body: { ok: false, message: RATE_LIMIT_MESSAGES[limit.scope] },
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    };
  }

  const filter = filterMessage(normalized.body, normalized.name);
  const operatorPresent = isOperatorPresent(event.operatorLastSeenAt);
  const decision = decideIntake({
    mode: event.moderationMode,
    verdict: filter.verdict,
    operatorPresent,
  });

  const approved = decision.status === "approved";
  const { message, created } = await repo.insertMessage({
    eventId: event.id,
    body: normalized.body,
    authorName: normalized.name,
    status: decision.status === "rejected" ? "rejected" : decision.status,
    filterVerdict: filter.verdict,
    rejectReason: decision.status === "rejected" ? decision.reason : null,
    releasedAt: approved ? releaseTimestamp("auto") : null,
    moderatedBy: decision.status === "pending" ? null : "auto",
    ipHash: context.ipHash,
    sessionId: input.sessionId,
    clientMsgId: input.clientMsgId,
    source: "user",
  });

  const result = accepted(message.id);
  // Il doppio invio non ripubblica niente: idempotenza fino in fondo.
  if (approved && created) {
    result.publish = { slug: event.slug, type: "message.created" };
  }
  return result;
}

export interface FeedResult {
  messages: PublicMessage[];
  serverTime: string;
  /** Cursore per la richiesta successiva. */
  cursor: string | null;
  /** Serata chiusa dal moderatore: torna a `false` se la riapre. */
  ended: boolean;
  /** Frase della schermata di chiusura, gia' risolta al default se non impostata. */
  closingPhrase: string;
}

/**
 * Feed del display.
 *
 * E' il percorso autorevole: la campanella realtime si limita a farlo partire
 * prima. Qui dentro gira anche lo sweeper del dead-man switch, perche' questa
 * chiamata avviene comunque ogni pochi secondi e ci risparmia un cron.
 */
export async function getFeed(args: {
  eventSlug: string;
  since: string | null;
  limit: number;
}): Promise<FeedResult> {
  const repo: Repository = getRepository();
  const event = await resolveEvent(args.eventSlug);
  const now = new Date();

  const released = await repo.releaseAbandoned({
    eventId: event.id,
    mode: event.moderationMode,
    now: now.getTime(),
  });

  if (released.length > 0) {
    console.info(
      `[moderazione] timeout raggiunto: liberati ${released.length} messaggi puliti`,
    );
  }

  const rows = await repo.listReleased({
    eventId: event.id,
    since: args.since,
    limit: args.limit,
    now: now.toISOString(),
  });

  const messages = rows.map(toPublicMessage);
  return {
    messages,
    serverTime: now.toISOString(),
    cursor: messages.at(-1)?.releasedAt ?? args.since,
    ended: event.status === "ended",
    closingPhrase: event.closingPhrase ?? serverConfig.event.closingPhrase,
  };
}

export async function publishCreated(slug: string): Promise<void> {
  await publishEvent(slug, makeEvent("message.created", {}));
}
