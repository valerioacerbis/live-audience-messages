import type { NextRequest } from "next/server";

import { publicConfig } from "@/lib/config.public";
import { serverConfig } from "@/lib/config";
import { isAdmin, jsonOk } from "@/lib/http/request";
import { getRepository } from "@/lib/db";
import { isOperatorPresent } from "@/lib/domain/policy";
import { resolveEvent } from "@/lib/service/messages";

/**
 * Soglie effettive del rate limit, in forma leggibile.
 *
 * Servono a rispondere con certezza a "cosa sta girando in produzione?" senza
 * dedurlo dal comportamento: le variabili d'ambiente di Vercel scavalcano i
 * default del codice, e l'unico modo onesto di saperlo e' chiederlo al server
 * che risponde davvero.
 */
function rateLimitSummary() {
  const { enabled, session, ip, global } = serverConfig.rateLimit;
  const window = (ms: number) => `${Math.round(ms / 1000)}s`;
  const scope = (max: number, windowMs: number) =>
    max > 0 ? `${max} / ${window(windowMs)}` : "spento";

  return {
    enabled,
    session: scope(session.max, session.windowMs),
    ip: scope(ip.max, ip.windowMs),
    global: scope(global.max, global.windowMs),
  };
}

/**
 * Diagnostica, e anche il bersaglio del cron di warm-up: una funzione
 * serverless fredda paga qualche centinaio di millisecondi sulla prima
 * richiesta della serata, e non voglio che a pagarli sia la prima persona
 * che scrive.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const started = Date.now();

  try {
    const event = await resolveEvent(publicConfig.event.slug);
    const stats = await getRepository().stats(event.id);

    return jsonOk({
      ok: true,
      drivers: { db: serverConfig.db.driver, realtime: publicConfig.realtime.driver },
      event: {
        slug: event.slug,
        status: event.status,
        moderationMode: event.moderationMode,
        operatorPresent: isOperatorPresent(event.operatorLastSeenAt),
      },
      stats,
      // Solo con il token admin: le soglie dicono a chi volesse abusarne
      // quanto spazio ha prima di essere fermato. Il pinger di warm-up
      // chiama senza token e riceve tutto il resto.
      ...(isAdmin(request) ? { rateLimit: rateLimitSummary() } : {}),
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    console.error("[api/health]", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "errore sconosciuto" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
