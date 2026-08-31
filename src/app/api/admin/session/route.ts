import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, matchesAdminToken } from "@/lib/http/request";

/**
 * Scambia il token dell'URL con un cookie httpOnly.
 *
 * Esiste per un vincolo di Next: un Server Component puo' LEGGERE i cookie ma
 * non scriverli — servono una Route Handler o una Server Action. Quindi
 * `/admin?k=...` rimbalza qui, il cookie viene impostato, e si torna su
 * `/admin` con l'URL pulito. Un salto in piu', invisibile a chi modera.
 *
 * Il token resta fuori dalla cronologia e dagli screenshot, che era lo scopo.
 */
export function GET(request: NextRequest): NextResponse {
  const token = request.nextUrl.searchParams.get("k");
  const destination = new URL("/admin", request.nextUrl.origin);

  // 303: il browser deve seguire con una GET, e la richiesta non va ripetuta
  // se qualcuno ricarica.
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "no-store");

  // Un token sbagliato non lascia traccia: si finisce su /admin senza cookie,
  // che mostra la schermata di accesso richiesto.
  if (!matchesAdminToken(token)) return response;

  response.cookies.set(ADMIN_COOKIE, token!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });

  return response;
}
