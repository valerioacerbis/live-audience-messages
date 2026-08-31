import { publicConfig } from "./config.public";

/** Config server-only. Non importare questo file da un componente client. */

function int(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export type DbDriver = "memory" | "supabase";

export const serverConfig = {
  ...publicConfig,

  db: {
    driver: (process.env.DB_DRIVER || "memory") as DbDriver,
    /** Dove il driver `memory` persiste su disco (solo dev). */
    memoryFile: process.env.MEMORY_DB_FILE || ".data/messages.json",
  },

  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
  },

  security: {
    /** Salt per l'hash degli IP. Mai loggare o salvare l'IP in chiaro. */
    ipHashSalt: process.env.IP_HASH_SALT || "dev-salt-change-me",
    adminToken: process.env.ADMIN_TOKEN || "dev-admin-token",
    /** Corpo della richiesta oltre il quale si rifiuta subito, senza parsing. */
    maxBodyBytes: int(process.env.MAX_BODY_BYTES, 2048),
  },

  rateLimit: {
    /**
     * Interruttore unico. Acceso di default: e' la protezione anti-spam per
     * la serata vera, non deve essere possibile dimenticarsela spenta per
     * errore. Le singole finestre/soglie sotto restano configurabili come
     * prima, ma non contano nulla se questo e' `false`.
     */
    enabled: bool(process.env.RATE_LIMIT_ENABLED, true),
    session: {
      windowMs: int(process.env.RL_SESSION_WINDOW_MS, 30_000),
      max: int(process.env.RL_SESSION_MAX, 1),
    },
    ip: {
      windowMs: int(process.env.RL_IP_WINDOW_MS, 600_000),
      max: int(process.env.RL_IP_MAX, 5),
    },
    /** Circuit breaker: protegge il DB da un flood, non il singolo utente. */
    global: {
      windowMs: int(process.env.RL_GLOBAL_WINDOW_MS, 60_000),
      max: int(process.env.RL_GLOBAL_MAX, 300),
    },
  },

  moderation: {
    /** Nessun heartbeat da /admin per questo tempo => modalita' non presidiata. */
    operatorTimeoutMs: int(process.env.OPERATOR_TIMEOUT_MS, 60_000),
    /** In modalita' non presidiata, i messaggi `clean` escono dopo questo ritardo. */
    autoReleaseDelayMs: int(process.env.AUTO_RELEASE_DELAY_MS, 20_000),
    /** Finestra per fermare un messaggio gia' approvato prima che vada a schermo. */
    displayDelayMs: int(process.env.DISPLAY_DELAY_MS, 8000),
    /** Quante frasi pre-scritte aggiunge un click sul pulsante "frasi pronte". */
    syntheticBatchSize: int(process.env.SYNTHETIC_BATCH_SIZE, 10),
  },

  turnstileServer: {
    secretKey: process.env.TURNSTILE_SECRET_KEY || null,
    /** Se Cloudflare non risponde, si passa oltre invece di bloccare il pubblico. */
    failOpen: bool(process.env.TURNSTILE_FAIL_OPEN, true),
  },
} as const;

export type ServerConfig = typeof serverConfig;
