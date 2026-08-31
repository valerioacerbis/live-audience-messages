import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

import { publicConfig } from "../config.public";
import { channelName, type RealtimeEvent } from "../domain/events";

/**
 * Transport lato browser.
 *
 * L'interfaccia e' volutamente minima — il canale trasporta solo una
 * campanella, mai dati — e questo e' il punto: cambiare provider (Pusher,
 * Ably, un WS proprio) significa scrivere un'altra funzione di trenta righe.
 * Il vendor lock-in sulla parte piu' rischiosa del sistema e' praticamente
 * nullo.
 */

export type ConnectionStatus = "connecting" | "live" | "polling" | "offline";

export interface Transport {
  close(): void;
}

export interface TransportHandlers {
  onEvent(event: RealtimeEvent): void;
  onStatusChange(status: ConnectionStatus): void;
}

/** Driver `polling`: nessun servizio esterno, il display si arrangia da solo. */
function createNullTransport(handlers: TransportHandlers): Transport {
  handlers.onStatusChange("polling");
  return { close() {} };
}

function createSupabaseTransport(
  eventSlug: string,
  handlers: TransportHandlers,
): Transport {
  const { supabaseUrl, supabaseAnonKey } = publicConfig.realtime;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[realtime] credenziali Supabase assenti, resto in polling");
    return createNullTransport(handlers);
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Il client riconnette da solo con backoff; sopra ci mettiamo comunque il
    // nostro watchdog, perche' "il socket e' aperto" non significa "arrivano
    // eventi" su una rete in tethering.
    realtime: { params: { eventsPerSecond: 20 } },
  });

  handlers.onStatusChange("connecting");

  const channel: RealtimeChannel = client
    .channel(channelName(eventSlug))
    .on("broadcast", { event: "*" }, ({ payload }) => {
      if (isRealtimeEvent(payload)) handlers.onEvent(payload);
    })
    .subscribe((status) => {
      switch (status) {
        case "SUBSCRIBED":
          handlers.onStatusChange("live");
          break;
        case "CHANNEL_ERROR":
        case "TIMED_OUT":
        case "CLOSED":
          handlers.onStatusChange("polling");
          break;
        default:
          break;
      }
    });

  return {
    close() {
      void client.removeChannel(channel);
    },
  };
}

/**
 * Il payload arriva dalla rete: va validato prima di toccarlo. Non e' una
 * difesa contro la falsificazione — quella e' strutturale, il display non si
 * fida comunque del contenuto e ricontrolla l'API — ma evita che un payload
 * malformato faccia esplodere il rendering a meta' concerto.
 */
function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}

export function createTransport(eventSlug: string, handlers: TransportHandlers): Transport {
  return publicConfig.realtime.driver === "supabase"
    ? createSupabaseTransport(eventSlug, handlers)
    : createNullTransport(handlers);
}
