import type { NextRequest } from "next/server";
import { z } from "zod";

import { publicConfig } from "@/lib/config.public";
import { isAdmin, jsonError, jsonOk, readJsonBody } from "@/lib/http/request";
import { moderateMessage } from "@/lib/service/admin";

const schema = z.object({
  eventSlug: z.string().default(publicConfig.event.slug),
  id: z.uuid(),
  action: z.enum(["approve", "reject", "remove"]),
});

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAdmin(request)) return jsonError(401, "Non autorizzato.");

  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.status, body.message);

  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return jsonError(400, "Richiesta non valida.");

  try {
    const result = await moderateMessage(parsed.data.eventSlug, parsed.data.id, parsed.data.action);
    if (!result.ok) return jsonError(404, "Messaggio non trovato.");
    return jsonOk({ ok: true });
  } catch (error) {
    console.error("[api/admin/moderate]", error);
    return jsonError(500, "Operazione non riuscita.");
  }
}
