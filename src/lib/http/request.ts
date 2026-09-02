import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { serverConfig } from "../config";

/** Utility condivise dalle route. Nessuna logica di prodotto qui dentro. */

export const ADMIN_COOKIE = "lam_admin";

/**
 * L'IP non viene mai salvato in chiaro: serve solo a contare, non a
 * identificare qualcuno. Con il salt l'hash non e' nemmeno riconducibile a
 * un IP per forza bruta ragionevole.
 */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${serverConfig.security.ipHashSalt}:${ip}`).digest("hex");
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}

export type BodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string };

/**
 * Legge il corpo con un tetto di dimensione.
 *
 * Il controllo e' su `Content-Length` E sui byte effettivamente letti: il
 * primo si puo' falsificare, il secondo no.
 */
export async function readJsonBody(request: NextRequest): Promise<BodyResult<unknown>> {
  const max = serverConfig.security.maxBodyBytes;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) {
    return { ok: false, status: 413, message: "Messaggio troppo grande." };
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, status: 415, message: "Formato non supportato." };
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > max) {
    return { ok: false, status: 413, message: "Messaggio troppo grande." };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, message: "Richiesta non valida." };
  }
}

/**
 * Verifica la password admin a tempo costante.
 *
 * Usata anche dalla pagina /admin, che non ha a disposizione una `NextRequest`.
 */
export function matchesAdminPassword(password: string | undefined | null): boolean {
  if (!password) return false;
  return secretsMatch(password, serverConfig.security.adminPassword);
}

/** Confronto a tempo costante: un segreto non si verifica con `===`. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAdmin(request: NextRequest): boolean {
  const fromCookie = request.cookies.get(ADMIN_COOKIE)?.value;
  const fromQuery = request.nextUrl.searchParams.get("k");
  const fromHeader = request.headers.get("x-admin-token");

  return [fromCookie, fromQuery, fromHeader].some(matchesAdminPassword);
}

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Content-Type-Options": "nosniff",
} as const;

export function jsonOk(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: { ...NO_STORE, ...init.headers },
  });
}

export function jsonError(status: number, message: string, extra: HeadersInit = {}): Response {
  return Response.json(
    { ok: false, message },
    { status, headers: { ...NO_STORE, ...extra } },
  );
}
