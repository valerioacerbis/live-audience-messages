/**
 * Envelope degli eventi realtime.
 *
 * Regola architetturale: l'evento e' solo una CAMPANELLA ("c'e' qualcosa di
 * nuovo"), mai la fonte di verita'. Il display reagisce facendo una GET
 * autorevole. Questo rende impossibile falsificare un messaggio dal browser,
 * chiude da solo i buchi dopo una disconnessione e rende il polling di riserva
 * lo stesso identico code path.
 *
 * Per aggiungere un evento: un membro in piu' nella union. TypeScript segnala
 * ogni `switch` da aggiornare.
 */

export type RealtimeEvent =
  | { type: "message.created"; at: string }
  | { type: "message.approved"; at: string }
  | { type: "message.rejected"; at: string; id: string }
  | { type: "message.removed"; at: string; id: string }
  | { type: "display.clear"; at: string }
  | { type: "event.started"; at: string }
  | { type: "event.ended"; at: string };

export type RealtimeEventType = RealtimeEvent["type"];

/** Eventi che devono far ricontrollare l'API al display. */
const RECONCILE_TRIGGERS: ReadonlySet<RealtimeEventType> = new Set([
  "message.created",
  "message.approved",
  "event.started",
]);

export function shouldReconcile(event: RealtimeEvent): boolean {
  return RECONCILE_TRIGGERS.has(event.type);
}

export function channelName(eventSlug: string): string {
  return `event:${eventSlug}`;
}

export function makeEvent<T extends RealtimeEventType>(
  type: T,
  extra: Omit<Extract<RealtimeEvent, { type: T }>, "type" | "at">,
): RealtimeEvent {
  return { type, at: new Date().toISOString(), ...extra } as RealtimeEvent;
}
