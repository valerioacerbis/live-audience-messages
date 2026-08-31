import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_COOKIE, matchesAdminToken } from "@/lib/http/request";

/**
 * Scambio token/cookie condiviso da ogni pagina sotto /admin.
 *
 * Il token arriva da `?k=` e viene scambiato con un cookie httpOnly da
 * `/api/admin/session`: cosi' non resta nella cronologia ne' finisce in uno
 * screenshot. Il giro passa da una Route Handler perche' un Server Component
 * puo' leggere i cookie ma non scriverli.
 */
export async function requireAdminToken(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  const fromQuery = typeof searchParams.k === "string" ? searchParams.k : null;
  if (fromQuery) {
    redirect(`/api/admin/session?k=${encodeURIComponent(fromQuery)}`);
  }

  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return matchesAdminToken(token) ? token! : null;
}
