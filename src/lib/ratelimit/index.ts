import { serverConfig } from "../config";
import type { Repository } from "../db/types";

/**
 * Rate limiting su Postgres.
 *
 * Perche' non Redis/Upstash: per contare qualche centinaio di richieste in una
 * serata servirebbe un vendor in piu' da configurare, monitorare e pagare. Le
 * query qui sotto sono tre `count` su indice — a questa scala e' rumore.
 *
 * L'interfaccia resta separata proprio perche' lo swap, se un giorno servisse,
 * e' una sostituzione di file e non una riscrittura.
 */

export type RateLimitScope = "session" | "ip" | "global";

export interface RateLimitVerdict {
  allowed: boolean;
  scope: RateLimitScope | null;
  /** Secondi da aspettare, per l'header `Retry-After`. */
  retryAfterSeconds: number;
}

const ALLOWED: RateLimitVerdict = { allowed: true, scope: null, retryAfterSeconds: 0 };

export async function checkRateLimit(
  repo: Repository,
  args: { eventId: string; ipHash: string; sessionId: string },
  now = Date.now(),
): Promise<RateLimitVerdict> {
  const { enabled, session, ip, global } = serverConfig.rateLimit;
  if (!enabled) return ALLOWED;

  const iso = (windowMs: number) => new Date(now - windowMs).toISOString();

  // In parallelo: tre round trip in sequenza sarebbero latenza regalata sul
  // percorso piu' sensibile dell'applicazione.
  const [sessionCount, ipCount, globalCount] = await Promise.all([
    repo.countRecent({
      eventId: args.eventId,
      sinceIso: iso(session.windowMs),
      sessionId: args.sessionId,
    }),
    repo.countRecent({
      eventId: args.eventId,
      sinceIso: iso(ip.windowMs),
      ipHash: args.ipHash,
    }),
    repo.countRecent({ eventId: args.eventId, sinceIso: iso(global.windowMs) }),
  ]);

  if (sessionCount >= session.max) {
    return { allowed: false, scope: "session", retryAfterSeconds: Math.ceil(session.windowMs / 1000) };
  }
  if (ipCount >= ip.max) {
    return { allowed: false, scope: "ip", retryAfterSeconds: Math.ceil(ip.windowMs / 1000) };
  }
  // Circuit breaker: protegge il sistema, non il singolo utente.
  if (globalCount >= global.max) {
    return { allowed: false, scope: "global", retryAfterSeconds: 30 };
  }

  return ALLOWED;
}

/** Messaggi umani: il pubblico non deve mai leggere un codice di errore. */
export const RATE_LIMIT_MESSAGES: Record<RateLimitScope, string> = {
  session: "Hai appena inviato un messaggio. Aspetta un attimo prima del prossimo.",
  ip: "Hai gia' inviato diversi messaggi. Lascia spazio anche agli altri!",
  global: "Stanno arrivando tantissimi messaggi. Riprova tra qualche secondo.",
};
