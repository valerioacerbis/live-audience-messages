import "server-only";

import { cookies } from "next/headers";

import { ADMIN_COOKIE, matchesAdminPassword } from "@/lib/http/request";

/**
 * Verifica il cookie di sessione condiviso da ogni pagina sotto /admin.
 *
 * Il cookie httpOnly viene impostato da `/api/admin/session` dopo il login
 * con password su `/admin/login`. Qui non serve leggere il valore in chiaro:
 * al client non deve arrivare nulla, le fetch della console viaggiano col
 * cookie da sole.
 */
export async function requireAdmin(): Promise<boolean> {
  const password = (await cookies()).get(ADMIN_COOKIE)?.value;
  return matchesAdminPassword(password);
}
