"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type { PublicMessage } from "../domain/types";
import {
  displayReducer,
  initialDisplayState,
  type DisplayState,
} from "./engine";
import { useMessageStream, type MessageStreamState } from "./useMessageStream";

const CACHE_KEY = "lam:display:cache";
const CACHE_LIMIT = 30;

interface CachedFeed {
  cursor: string | null;
  messages: PublicMessage[];
}

/**
 * Cache locale del feed.
 *
 * Copre un caso preciso: il portatile del display si ricarica (o il browser
 * riparte) proprio mentre la rete non c'e'. Senza cache lo schermo resterebbe
 * sulla schermata di attesa finche' la rete non torna; con la cache riprende
 * da dov'era. E' poco codice per uno scenario che, con una connessione in
 * tethering, non e' affatto improbabile.
 */
function readCache(): CachedFeed | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedFeed) : null;
  } catch {
    return null;
  }
}

function writeCache(feed: CachedFeed): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(feed));
  } catch {
    // localStorage pieno o disabilitato: e' una comodita', non un requisito.
  }
}

function clearCache(): void {
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Idem: se non si riesce a scrivere, non si riusciva nemmeno a leggere prima.
  }
}

export interface DisplayEngine {
  state: DisplayState;
  connection: MessageStreamState;
}

export function useDisplayEngine(eventSlug: string): DisplayEngine {
  const [state, dispatch] = useReducer(displayReducer, undefined, initialDisplayState);

  // Lo stream legge il cursore da qui quando fa una fetch, cioe' sempre dopo
  // il render: l'aggiornamento in un effetto e' abbastanza tempestivo.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const onMessages = useCallback((messages: PublicMessage[]) => {
    dispatch({ type: "ingest", messages, now: Date.now() });
  }, []);

  const onRemove = useCallback((id: string) => {
    dispatch({ type: "remove", id, now: Date.now() });
  }, []);

  const onClear = useCallback(() => {
    dispatch({ type: "clear", now: Date.now() });
    // Il panic button e' pensato per essere irreversibile: se la cache locale
    // sopravvivesse, un refresh subito dopo rimetterebbe a schermo cio' che
    // si voleva togliere, prima ancora che il feed dal server torni vuoto.
    clearCache();
  }, []);

  const getCursor = useCallback(() => stateRef.current.cursor, []);

  const connection = useMessageStream(eventSlug, {
    onMessages,
    onRemove,
    onClear,
    getCursor,
  });

  /* --- ripartenza a freddo dalla cache --- */
  useEffect(() => {
    const cached = readCache();
    if (cached?.messages.length) {
      dispatch({ type: "restoreCache", messages: cached.messages, now: Date.now() });
    }
  }, []);

  useEffect(() => {
    if (state.all.length === 0) return;
    writeCache({ cursor: state.cursor, messages: state.all.slice(-CACHE_LIMIT) });
  }, [state.all, state.cursor]);

  /* --- orologio del display --- */
  useEffect(() => {
    let frame = 0;
    let last = 0;

    const loop = (time: number) => {
      // ~20 volte al secondo bastano per una macchina a stati con soglie nei
      // decimi di secondo, e lasciano la GPU libera per le animazioni (e per
      // il renderer WebGL dello STEP 2).
      if (time - last >= 50) {
        last = time;
        dispatch({ type: "tick", now: Date.now() });
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  /* --- telemetria dei messaggi andati in onda (best-effort) --- */
  const reported = useRef(new Set<string>());
  useEffect(() => {
    const unreported = state.all.filter((m) => !reported.current.has(m.id));
    if (unreported.length === 0) return;

    for (const message of unreported) reported.current.add(message.id);

    void fetch("/api/messages/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unreported.map((m) => m.id) }),
      keepalive: true,
    }).catch(() => {
      // Telemetria: se fallisce, lo spettacolo continua.
    });
  }, [state.all]);

  return useMemo(() => ({ state, connection }), [state, connection]);
}
