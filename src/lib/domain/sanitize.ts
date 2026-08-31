/**
 * Normalizzazione del testo prima che finisca su uno schermo di 6 metri.
 *
 * Non e' solo "pulizia": alcuni di questi passaggi sono difese vere.
 * I caratteri bidirezionali permettono di far leggere a schermo qualcosa di
 * diverso da quello che l'operatore vede in coda; i combining marks (zalgo)
 * sfondano verticalmente qualunque layout.
 *
 * L'output HTML non e' un problema: React fa escaping di default e nel
 * progetto `dangerouslySetInnerHTML` e' vietato dal linter.
 */

/** Bidi override/embedding/isolate, zero-width, soft hyphen, BOM. */
const INVISIBLE_AND_BIDI =
  /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu;

/** Control chars C0/C1. \t \n \r sono gestiti dal collasso degli spazi. */
const CONTROL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

/** Piu' di 2 segni combinanti di fila = zalgo. */
const ZALGO = /(\p{M})\p{M}{2,}/gu;

/** Stesso carattere ripetuto 5+ volte ("AAAAAAAAA", "!!!!!!!!"). */
const CHAR_FLOOD = /(.)\1{4,}/gu;

const WHITESPACE_RUN = /\s+/gu;

export function sanitizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(INVISIBLE_AND_BIDI, "")
    .replace(CONTROL_CHARS, "")
    .replace(ZALGO, "$1")
    .replace(CHAR_FLOOD, "$1$1$1")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

/** Il nome sta su una riga sola e non contiene punteggiatura decorativa. */
export function sanitizeName(input: string): string {
  return sanitizeText(input)
    .replace(/[<>{}[\]|\\^~`]/gu, "")
    .trim();
}

let segmenter: Intl.Segmenter | null = null;

function getSegmenter(): Intl.Segmenter | null {
  if (typeof Intl.Segmenter !== "function") return null;
  segmenter ??= new Intl.Segmenter("it", { granularity: "grapheme" });
  return segmenter;
}

/**
 * Conta i grafemi, non le UTF-16 code unit: un'emoji con modificatore di tono
 * vale 1, non 4. Senza questo il contatore sul telefono e la validazione sul
 * server darebbero due numeri diversi, e l'utente vedrebbe un errore assurdo.
 */
export function countGraphemes(input: string): number {
  const seg = getSegmenter();
  if (!seg) return [...input].length;
  return Array.from(seg.segment(input)).length;
}

export function truncateGraphemes(input: string, max: number): string {
  if (countGraphemes(input) <= max) return input;
  const seg = getSegmenter();
  if (!seg) return [...input].slice(0, max).join("");
  let out = "";
  let n = 0;
  for (const part of seg.segment(input)) {
    if (n >= max) break;
    out += part.segment;
    n++;
  }
  return out;
}

/** Un messaggio fatto solo di emoji o punteggiatura non e' un messaggio. */
export function hasLetters(input: string): boolean {
  return /\p{L}/u.test(input);
}
