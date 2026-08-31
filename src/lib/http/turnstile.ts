import "server-only";

import { serverConfig } from "../config";

/**
 * Cloudflare Turnstile — presente nel codice, spento di default.
 *
 * La scelta e' deliberata e va contro l'istinto. Turnstile e' ottimo, ma
 * aggiunge una dipendenza da un CDN esterno nel percorso critico: se la rete
 * del locale e' satura o filtra qualcosa, il pubblico non riesce piu' a
 * inviare e dal palco non si puo' fare niente. Per una serata di due ore il
 * rischio di indisponibilita' e' peggiore del rischio bot.
 *
 * Quindi resta pronto: si accende da variabile d'ambiente in trenta secondi
 * se il link finisce in giro. E anche da acceso, se Cloudflare non risponde,
 * di default lascia passare invece di bloccare tutti.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | null | undefined, ip: string): Promise<boolean> {
  if (!serverConfig.turnstile.enabled) return true;

  const secret = serverConfig.turnstileServer.secretKey;
  if (!secret) {
    console.warn("[turnstile] abilitato ma TURNSTILE_SECRET_KEY manca");
    return serverConfig.turnstileServer.failOpen;
  }

  if (!token) return false;

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return serverConfig.turnstileServer.failOpen;

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.warn("[turnstile] verifica non riuscita", error);
    return serverConfig.turnstileServer.failOpen;
  }
}
