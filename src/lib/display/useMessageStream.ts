"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { publicConfig } from "../config.public";
import { shouldReconcile, type RealtimeEvent } from "../domain/events";
import type { PublicMessage } from "../domain/types";
import { createTransport, type ConnectionStatus, type Transport } from "../realtime/transport";

/**
 * Aggancio del display alla sorgente dei messaggi.
 *
 * Il modello e' "campanella + rilettura": l'evento realtime dice soltanto che
 * c'e' qualcosa di nuovo, e la verita' arriva sempre da una GET. Da qui
 * discendono tre proprieta' che non abbiamo dovuto costruire una per una:
 *
 * - un evento falsificato non produce nulla (la GET non restituisce niente);
 * - dopo una disconnessione il buco si chiude da solo (il cursore e' vecchio);
 * - il polling di riserva NON e' un secondo percorso da mantenere: e' la
 *   stessa funzione, chiamata da un timer invece che da un evento.
 *
 * L'ultima e' quella che conta davvero il giorno del concerto: il percorso
 * degradato viene esercitato a ogni singola richiesta, quindi non puo' essere
 * rotto senza che ce ne accorgiamo prima.
 */

export interface MessageStreamHandlers {
  onMessages(messages: PublicMessage[]): void;
  onRemove(id: string): void;
  onClear(): void;
  getCursor(): string | null;
}

export interface MessageStreamState {
  status: ConnectionStatus;
  lastSyncAt: number | null;
  /** Errori di rete consecutivi: alimenta il backoff e l'indicatore. */
  failures: number;
}

const { realtime } = publicConfig;

export function useMessageStream(
  eventSlug: string,
  handlers: MessageStreamHandlers,
): MessageStreamState {
  const [state, setState] = useState<MessageStreamState>({
    status: "connecting",
    lastSyncAt: null,
    failures: 0,
  });

  // I callback cambiano a ogni render; tenerli in un ref evita di smontare e
  // rimontare la connessione realtime a ogni ridisegno dello schermo.
  // L'assegnazione va in un effetto: scrivere un ref durante il render
  // rompe le assunzioni del compilatore di React.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const inFlight = useRef(false);
  const pendingSignal = useRef(false);

  const sync = useCallback(async (): Promise<void> => {
    // Sotto burst arrivano molti segnali ravvicinati. Ne serve una alla volta:
    // se altri arrivano mentre la richiesta e' in volo, se ne fa UNA sola
    // dopo, non una per segnale. E' il ciclo `do/while` a garantirlo, senza
    // che la funzione debba richiamare se stessa.
    if (inFlight.current) {
      pendingSignal.current = true;
      return;
    }
    inFlight.current = true;

    try {
      do {
        pendingSignal.current = false;

        try {
          const cursor = handlersRef.current.getCursor();
          const params = new URLSearchParams({ eventSlug, limit: "100" });
          if (cursor) params.set("since", cursor);

          const response = await fetch(`/api/messages?${params}`, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = (await response.json()) as { messages?: PublicMessage[] };
          if (data.messages?.length) handlersRef.current.onMessages(data.messages);

          setState((prev) => ({ ...prev, lastSyncAt: Date.now(), failures: 0 }));
        } catch (error) {
          console.warn("[stream] sync non riuscito", error);
          setState((prev) => ({ ...prev, failures: prev.failures + 1 }));
          // Su errore non si insiste subito: ci pensa il polling con backoff.
          break;
        }
      } while (pendingSignal.current);
    } finally {
      inFlight.current = false;
    }
  }, [eventSlug]);

  /* --- canale realtime: solo campanelle --- */
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const onEvent = (event: RealtimeEvent) => {
      switch (event.type) {
        case "message.removed":
        case "message.rejected":
          handlersRef.current.onRemove(event.id);
          return;
        case "display.clear":
          handlersRef.current.onClear();
          return;
        default:
          break;
      }

      if (!shouldReconcile(event)) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => void sync(), realtime.signalDebounceMs);
    };

    const transport: Transport = createTransport(eventSlug, {
      onEvent,
      onStatusChange: (status) => setState((prev) => ({ ...prev, status })),
    });

    void sync();

    return () => {
      clearTimeout(debounce);
      transport.close();
    };
  }, [eventSlug, sync]);

  /* --- rete di sicurezza: polling adattivo --- */
  useEffect(() => {
    /**
     * Il polling gira SEMPRE, anche a WebSocket connesso: e' la garanzia che
     * un socket "aperto ma muto" — lo scenario tipico del tethering 4G in un
     * locale pieno — non lasci lo schermo fermo. Quando il canale funziona
     * questa richiesta non trova quasi mai nulla di nuovo e costa pochi byte.
     */
    const interval =
      state.failures > 0
        ? Math.min(
            realtime.pollIntervalMs * 2 ** state.failures,
            realtime.pollMaxIntervalMs,
          )
        : realtime.pollIntervalMs;

    const timer = setInterval(() => void sync(), interval);
    return () => clearInterval(timer);
  }, [sync, state.failures]);

  /* --- il socket e' vivo ma non arriva niente? --- */
  useEffect(() => {
    const timer = setInterval(() => {
      setState((prev) => {
        if (prev.status !== "live" || !prev.lastSyncAt) return prev;
        const silentFor = Date.now() - prev.lastSyncAt;
        if (silentFor < realtime.staleAfterMs * 3) return prev;
        return { ...prev, status: "polling" };
      });
    }, realtime.staleAfterMs);
    return () => clearInterval(timer);
  }, []);

  /* --- ritorno dallo standby o rete che torna: risincronizza subito --- */
  useEffect(() => {
    const resync = () => void sync();
    window.addEventListener("online", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("online", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [sync]);

  return state;
}
