import type { NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, jsonOk, readJsonBody } from "@/lib/http/request";
import { markDisplayed } from "@/lib/service/admin";

/**
 * Telemetria del display: quali messaggi sono davvero andati in onda.
 *
 * Deliberatamente best-effort. Se fallisce, lo spettacolo continua: e' un
 * dato che serve per l'export di fine serata, non per far funzionare niente.
 */
const schema = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

export async function POST(request: NextRequest): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.status, body.message);

  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return jsonError(400, "Richiesta non valida.");

  try {
    await markDisplayed(parsed.data.ids);
  } catch (error) {
    console.warn("[api/messages/seen]", error);
  }
  return jsonOk({ ok: true });
}
