import { NextResponse, type NextRequest } from "next/server";

import { ADMIN_COOKIE, matchesAdminPassword } from "@/lib/http/request";

/**
 * Scambia la password del form di login con un cookie httpOnly.
 *
 * Form HTML puro (niente `fetch`/JS in mezzo): un POST che il browser sa fare
 * anche se qualcosa nella pagina va storto, ed è quello che conta la sera
 * dell'evento. Un login sbagliato rimbalza su `/admin/login?error=1`, uno
 * corretto su `/admin` con il cookie impostato.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const password = form.get("password");

  const loginPage = new URL("/admin/login", request.nextUrl.origin);
  const admin = new URL("/admin", request.nextUrl.origin);

  if (typeof password !== "string" || !matchesAdminPassword(password)) {
    loginPage.searchParams.set("error", "1");
    const response = NextResponse.redirect(loginPage, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const response = NextResponse.redirect(admin, 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(ADMIN_COOKIE, password, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });

  return response;
}
