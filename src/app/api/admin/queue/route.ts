import type { NextRequest } from "next/server";

import { publicConfig } from "@/lib/config.public";
import { isAdmin, jsonError, jsonOk } from "@/lib/http/request";
import { getAdminSnapshot } from "@/lib/service/admin";

/**
 * Coda di moderazione.
 *
 * Ogni chiamata vale come heartbeat dell'operatore: la pagina /admin
 * interroga questa route in continuazione, quindi "c'e' un umano" coincide
 * con "qualcuno sta guardando". Non serve un endpoint di presenza, e non c'e'
 * modo di risultare presenti senza esserlo davvero.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isAdmin(request)) return jsonError(401, "Non autorizzato.");

  const slug = request.nextUrl.searchParams.get("eventSlug") ?? publicConfig.event.slug;

  try {
    return jsonOk({ ok: true, ...(await getAdminSnapshot(slug)) });
  } catch (error) {
    console.error("[api/admin/queue]", error);
    return jsonError(500, "Coda non disponibile.");
  }
}
