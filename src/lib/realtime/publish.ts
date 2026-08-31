import "server-only";

import { serverConfig } from "../config";
import { channelName, type RealtimeEvent } from "../domain/events";

/**
 * Pubblicazione della "campanella" dal server.
 *
 * Usa l'endpoint HTTP di broadcast di Supabase, non il client WebSocket: una
 * funzione serverless vive pochi millisecondi e aprire un handshake WS per poi
 * chiuderlo sarebbe piu' lento e piu' fragile della richiesta HTTP.
 *
 * Regola: questa chiamata NON deve mai far fallire una richiesta. Se il
 * broadcast non parte, il display se ne accorge al polling successivo e il
 * pubblico non vede alcuna differenza. Un errore qui non deve trasformarsi in
 * un messaggio perso.
 */

export async function publishEvent(eventSlug: string, event: RealtimeEvent): Promise<void> {
  if (serverConfig.realtime.driver !== "supabase") return;

  const { url } = serverConfig.supabase;
  const key = serverConfig.supabase.serviceRoleKey ?? serverConfig.supabase.anonKey;
  if (!url || !key) return;

  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: channelName(eventSlug),
            event: event.type,
            payload: event,
          },
        ],
      }),
      // Il display ha comunque il polling: meglio rinunciare che tenere in
      // ostaggio la risposta all'utente.
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      console.warn("[realtime] broadcast non riuscito", response.status, await response.text());
    }
  } catch (error) {
    console.warn("[realtime] broadcast non riuscito", error);
  }
}
