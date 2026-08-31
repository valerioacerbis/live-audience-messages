import { after, type NextRequest } from "next/server";

import { publicConfig } from "@/lib/config.public";
import { createMessageSchema, messagesQuerySchema } from "@/lib/domain/message.schema";
import { getClientIp, hashIp, jsonError, jsonOk, readJsonBody } from "@/lib/http/request";
import { verifyTurnstile } from "@/lib/http/turnstile";
import { createMessage, getFeed, publishCreated } from "@/lib/service/messages";

/**
 * POST — invio di un messaggio dal pubblico.
 * GET  — feed autorevole per il display.
 *
 * Nota su CORS: non ce n'e'. Nessun `Access-Control-Allow-Origin`, quindi
 * solo la nostra origine puo' chiamare queste route dal browser. Un endpoint
 * pubblico non ha bisogno di essere aperto a chiunque.
 */

export async function POST(request: NextRequest): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.status, body.message);

  const parsed = createMessageSchema.safeParse(body.value);
  if (!parsed.success) {
    return jsonError(400, "Controlla il messaggio e riprova.");
  }

  const ip = getClientIp(request);

  try {
    const result = await createMessage(parsed.data, { ipHash: hashIp(ip) });

    // Turnstile solo se acceso: la verifica costa una chiamata esterna e non
    // ha senso pagarla su una richiesta che stiamo comunque rifiutando.
    if (result.status === 200 && publicConfig.turnstile.enabled) {
      const human = await verifyTurnstile(parsed.data.turnstileToken, ip);
      if (!human) return jsonError(403, "Verifica non riuscita. Ricarica la pagina e riprova.");
    }

    // La campanella parte dopo aver risposto: chi ha inviato non deve
    // aspettare il broadcast, e se il broadcast fallisce il display se ne
    // accorge comunque al polling successivo.
    if (result.publish) {
      const { slug } = result.publish;
      after(() => publishCreated(slug));
    }

    return jsonOk(result.body, { status: result.status, headers: result.headers });
  } catch (error) {
    console.error("[api/messages] POST", error);
    return jsonError(500, "Qualcosa e' andato storto. Riprova tra un istante.");
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = messagesQuerySchema.safeParse(params);
  if (!parsed.success) return jsonError(400, "Parametri non validi.");

  try {
    const feed = await getFeed({
      eventSlug: parsed.data.eventSlug,
      since: parsed.data.since ?? null,
      limit: parsed.data.limit,
    });
    return jsonOk({ ok: true, ...feed });
  } catch (error) {
    console.error("[api/messages] GET", error);
    return jsonError(500, "Feed non disponibile.");
  }
}
