"use client";

import { useCallback, useEffect, useState } from "react";

import { publicConfig } from "@/lib/config.public";
import type { ModerationMessage } from "@/lib/domain/types";

/**
 * Polling di `/admin/review`. Stesso ritmo delle altre pagine sotto /admin:
 * anche aprire questa vale come heartbeat dell'operatore (vedi useAdminSnapshot).
 */

export interface ReviewSnapshot {
  approved: ModerationMessage[];
  rejected: ModerationMessage[];
}

const POLL_MS = 3000;

export function useReviewSnapshot() {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        `/api/admin/review?eventSlug=${publicConfig.event.slug}`,
      )) as ReviewSnapshot;
      setSnapshot(data);
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

  return { snapshot, setSnapshot, error, setError, call };
}
