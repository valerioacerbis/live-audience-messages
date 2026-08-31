import { publicConfig } from "@/lib/config.public";
import { serverConfig } from "@/lib/config";
import { jsonOk } from "@/lib/http/request";
import { getRepository } from "@/lib/db";
import { isOperatorPresent } from "@/lib/domain/policy";
import { resolveEvent } from "@/lib/service/messages";

/**
 * Diagnostica, e anche il bersaglio del cron di warm-up: una funzione
 * serverless fredda paga qualche centinaio di millisecondi sulla prima
 * richiesta della serata, e non voglio che a pagarli sia la prima persona
 * che scrive.
 */
export async function GET(): Promise<Response> {
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
