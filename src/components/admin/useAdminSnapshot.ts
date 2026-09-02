"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { publicConfig } from "@/lib/config.public";
import type { ModerationMessage, ModerationMode } from "@/lib/domain/types";

/**
 * Polling condiviso da /admin e /admin/settings.
 *
 * Non e' solo un caricamento dati: ogni chiamata a `/api/admin/queue` E' il
 * segnale di presenza dell'operatore (dead-man switch). Qualunque pagina
 * sotto /admin resti aperta deve continuare a interrogarla, altrimenti il
 * sistema si crede senza operatore anche se il moderatore e' semplicemente
 * su un'altra scheda della console.
 */

export interface AdminSnapshot {
  event: { slug: string; name: string; moderationMode: ModerationMode; status: string };
  pending: ModerationMessage[];
  stats: { total: number; approved: number; pending: number; rejected: number; rotating: number };
  syntheticAvailable: number;
}

const POLL_MS = 3000;

export function useAdminSnapshot() {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Id gia' moderati con successo, anche se il prossimo poll non se ne e'
   * ancora accorto. Vedi la nota in AdminConsole: un id qui non torna mai
   * pending, quindi filtrarlo da ogni snapshot successivo e' sempre corretto.
   */
  const confirmed = useRef<Set<string>>(new Set());

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = (await call(
        `/api/admin/queue?eventSlug=${publicConfig.event.slug}`,
      )) as AdminSnapshot;
      setSnapshot({
        ...data,
        pending: data.pending.filter((m) => !confirmed.current.has(m.id)),
      });
      setError(null);
    } catch {
      setError("Connessione persa. Riprovo...");
    }
  }, [call]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { snapshot, setSnapshot, error, setError, call, confirmed, refresh };
}
