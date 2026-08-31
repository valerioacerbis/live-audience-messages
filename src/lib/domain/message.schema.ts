import { z } from "zod";

import { publicConfig } from "../config.public";
import { countGraphemes, hasLetters, sanitizeName, sanitizeText } from "./sanitize";

/**
 * Schema condiviso client/server.
 *
 * Il client lo usa per dare feedback immediato, il server lo riapplica sempre
 * da zero: il client non e' mai autorevole.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const createMessageSchema = z.object({
  eventSlug: z.string().regex(SLUG, "slug evento non valido"),
  body: z.string().max(4000),
  name: z.string().max(200).nullish(),
  /** Chiave di idempotenza generata dal client: salva dai doppi invii. */
  clientMsgId: z.uuid(),
  /** Identita' anonima persistente nel localStorage del telefono. */
  sessionId: z.uuid(),
  /** Millisecondi tra apertura del form e invio. */
  elapsedMs: z.number().int().min(0).max(86_400_000),
  /**
   * Honeypot: un umano non lo vede, quindi lo lascia vuoto.
   * Volutamente NON validato a stringa vuota: un 400 direbbe al bot che
   * l'abbiamo riconosciuto. Il campo passa, e viene scartato in silenzio
   * piu' avanti con una risposta identica a quella di un invio riuscito.
   */
  hp: z.string().max(200).optional(),
  turnstileToken: z.string().max(4096).nullish(),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const messagesQuerySchema = z.object({
  eventSlug: z.string().regex(SLUG).default(publicConfig.event.slug),
  /**
   * Cursore: ISO timestamp di `releasedAt`. Con `offset: true` perche' il
   * driver Supabase restituisce i timestamptz come "+00:00", non come "Z" —
   * senza, ogni richiesta col cursore (cioe' tutto il polling dopo il primo
   * caricamento) verrebbe rifiutata con 400.
   */
  since: z.iso.datetime({ offset: true }).nullish(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/* ------------------------------------------------------------------ */

export type NormalizeError =
  | "empty"
  | "too_long"
  | "no_letters"
  | "name_too_long";

export type NormalizeResult =
  | { ok: true; body: string; name: string | null }
  | { ok: false; error: NormalizeError };

/**
 * Sanitizza e applica le regole di contenuto.
 *
 * Volutamente separata dallo schema Zod: e' logica di prodotto, cambia piu'
 * spesso della forma del payload, ed e' la parte che vale la pena testare.
 */
export function normalizeMessage(rawBody: string, rawName?: string | null): NormalizeResult {
  const body = sanitizeText(rawBody);

  if (body.length === 0) return { ok: false, error: "empty" };
  if (countGraphemes(body) > publicConfig.limits.messageMaxLength) {
    return { ok: false, error: "too_long" };
  }
  if (!hasLetters(body)) return { ok: false, error: "no_letters" };

  const cleanedName = rawName ? sanitizeName(rawName) : "";
  if (countGraphemes(cleanedName) > publicConfig.limits.nameMaxLength) {
    return { ok: false, error: "name_too_long" };
  }

  return { ok: true, body, name: cleanedName.length > 0 ? cleanedName : null };
}

/** Messaggi rivolti al pubblico: mai gergo tecnico, mai codici di errore. */
export const NORMALIZE_ERROR_MESSAGES: Record<NormalizeError, string> = {
  empty: "Scrivi qualcosa prima di inviare.",
  too_long: `Il messaggio supera ${publicConfig.limits.messageMaxLength} caratteri.`,
  no_letters: "Aggiungi qualche parola al tuo messaggio.",
  name_too_long: `Il nome supera ${publicConfig.limits.nameMaxLength} caratteri.`,
};
