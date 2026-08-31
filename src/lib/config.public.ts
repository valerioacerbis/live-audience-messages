/**
 * Configurazione visibile al browser.
 *
 * IMPORTANTE: ogni `process.env.NEXT_PUBLIC_*` deve essere referenziato
 * LETTERALMENTE, altrimenti il bundler non riesce a sostituirlo a build time
 * e nel browser arriva `undefined`. Niente accessi dinamici qui dentro.
 */

function int(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export type RealtimeDriver = "polling" | "supabase";

export const publicConfig = {
  event: {
    slug: process.env.NEXT_PUBLIC_EVENT_SLUG || "default",
    name: "Smooth Criminals",
  },

  limits: {
    /** Lunghezza massima del messaggio, in *grafemi* (un'emoji = 1). */
    messageMaxLength: int(process.env.NEXT_PUBLIC_MESSAGE_MAX_LENGTH, 280),
    nameMaxLength: int(process.env.NEXT_PUBLIC_NAME_MAX_LENGTH, 24),
  },

  realtime: {
    driver: (process.env.NEXT_PUBLIC_REALTIME_DRIVER || "polling") as RealtimeDriver,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    /** Polling normale quando il canale realtime e' vivo (rete di riserva). */
    pollIntervalMs: int(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS, 2000),
    /** Backoff massimo del polling su rete instabile (tethering 4G). */
    pollMaxIntervalMs: int(process.env.NEXT_PUBLIC_POLL_MAX_INTERVAL_MS, 8000),
    /** Nessun segnale ne' heartbeat per questo tempo => si passa a polling. */
    staleAfterMs: int(process.env.NEXT_PUBLIC_REALTIME_STALE_MS, 5000),
    /** I segnali ravvicinati vengono raggruppati in una sola fetch. */
    signalDebounceMs: int(process.env.NEXT_PUBLIC_SIGNAL_DEBOUNCE_MS, 150),
  },

  display: {
    enterMs: int(process.env.NEXT_PUBLIC_DISPLAY_ENTER_MS, 500),
    exitMs: int(process.env.NEXT_PUBLIC_DISPLAY_EXIT_MS, 400),
    /** hold = base + perChar * caratteri, poi clampato tra min e max. */
    holdBaseMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_BASE_MS, 2500),
    holdPerCharMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_PER_CHAR_MS, 45),
    holdMinMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_MIN_MS, 3000),
    holdMaxMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_MAX_MS, 8000),
    /** Oltre questa profondita' di coda si comincia ad accelerare. */
    burstThreshold: int(process.env.NEXT_PUBLIC_DISPLAY_BURST_THRESHOLD, 8),
    /** Coda satura: hold al minimo. */
    burstSaturation: int(process.env.NEXT_PUBLIC_DISPLAY_BURST_SATURATION, 25),
    /** Tetto di sicurezza della coda in memoria. */
    maxQueueLength: int(process.env.NEXT_PUBLIC_DISPLAY_MAX_QUEUE, 500),
  },

  turnstile: {
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    enabled: bool(process.env.NEXT_PUBLIC_TURNSTILE_ENABLED, false),
  },

  /** Tempo minimo tra apertura form e invio: sotto questa soglia e' un bot. */
  minSubmitMs: int(process.env.NEXT_PUBLIC_MIN_SUBMIT_MS, 1500),
} as const;

export type PublicConfig = typeof publicConfig;
