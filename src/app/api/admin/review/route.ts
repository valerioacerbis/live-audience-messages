import type { NextRequest } from "next/server";

import { publicConfig } from "@/lib/config.public";
import { isAdmin, jsonError, jsonOk } from "@/lib/http/request";
import { getReviewSnapshot } from "@/lib/service/admin";

/**
 * Messaggi gia' decisi (approvati e bloccati): la pagina di revisione per
 * correggere un errore, non per moderarne uno nuovo (quello resta in
 * `/api/admin/queue`).
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isAdmin(request)) return jsonError(401, "Non autorizzato.");

  const slug = request.nextUrl.searchParams.get("eventSlug") ?? publicConfig.event.slug;

  try {
    return jsonOk({ ok: true, ...(await getReviewSnapshot(slug)) });
  } catch (error) {
    console.error("[api/admin/review]", error);
    return jsonError(500, "Revisione non disponibile.");
  }
}
