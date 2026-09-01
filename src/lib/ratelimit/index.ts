import { serverConfig } from "../config";
import type { RateLimitQuery, Repository } from "../db/types";

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

/**
 * `max: 0` spegne l'ambito, non blocca tutto.
 *
 * E' la lettura che chiunque dara' alla variabile trovandola in `.env`, e con
 * la semantica opposta (`count >= 0` sempre vero) una svista spegnerebbe
 * l'intera serata invece di allentare un limite. Vale la riga in piu'.
 */
const isActive = (max: number): boolean => max > 0;

export async function checkRateLimit(
  repo: Repository,
  args: { eventId: string; ipHash: string; sessionId: string },
  now = Date.now(),
): Promise<RateLimitVerdict> {
  const { enabled, session, ip, global } = serverConfig.rateLimit;
  if (!enabled) return ALLOWED;

  const iso = (windowMs: number) => new Date(now - windowMs).toISOString();

  /** Un ambito spento non paga nemmeno il round trip. */
  const countIf = (max: number, query: RateLimitQuery): Promise<number> =>
    isActive(max) ? repo.countRecent(query) : Promise.resolve(0);

  // In parallelo: tre round trip in sequenza sarebbero latenza regalata sul
  // percorso piu' sensibile dell'applicazione.
  const [sessionCount, ipCount, globalCount] = await Promise.all([
    countIf(session.max, {
      eventId: args.eventId,
      sinceIso: iso(session.windowMs),
      sessionId: args.sessionId,
    }),
    countIf(ip.max, {
      eventId: args.eventId,
      sinceIso: iso(ip.windowMs),
      ipHash: args.ipHash,
    }),
    countIf(global.max, { eventId: args.eventId, sinceIso: iso(global.windowMs) }),
  ]);

  const exceeded = (max: number, count: number): boolean => isActive(max) && count >= max;

  if (exceeded(session.max, sessionCount)) {
    return { allowed: false, scope: "session", retryAfterSeconds: Math.ceil(session.windowMs / 1000) };
  }
  if (exceeded(ip.max, ipCount)) {
    return { allowed: false, scope: "ip", retryAfterSeconds: Math.ceil(ip.windowMs / 1000) };
  }
  // Circuit breaker: protegge il sistema, non il singolo utente.
  if (exceeded(global.max, globalCount)) {
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
