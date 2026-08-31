import {
  DataSet,
  englishDataset,
  englishRecommendedTransformers,
  parseRawPattern,
  RegExpMatcher,
} from "obscenity";

import type { FilterVerdict } from "./types";
import {
  IT_BLOCKED_PHRASES,
  IT_BLOCKED_WORDS,
  IT_SUSPECT_PHRASES,
  IT_SUSPECT_WORDS,
  IT_WHITELIST,
} from "./wordlists.it";

/**
 * Filtro automatico a tre livelli.
 *
 * Non pretende di essere infallibile: nessuna wordlist lo e'. Il suo compito
 * e' ridurre il carico sull'operatore e, quando l'operatore non c'e', essere
 * abbastanza prudente da non far passare nulla di dubbio.
 */

export interface FilterResult {
  verdict: FilterVerdict;
  /** Motivi leggibili, mostrati nella coda di moderazione. */
  reasons: string[];
}

interface PhraseMeta {
  severity: "blocked" | "suspect";
}

/**
 * "cazzo" -> "cazo".
 *
 * I transformer consigliati di `obscenity` collassano le lettere ripetute nel
 * testo in ingresso: e' cio' che rende inutile scrivere "caaaaazzzzo" per
 * aggirare il filtro. Il rovescio della medaglia e' che i pattern vanno
 * scritti nella stessa forma, altrimenti non agganciano nulla — ed e' un
 * fallimento silenzioso. Collassare le liste a runtime tiene la sorgente
 * leggibile e i pattern corretti per costruzione.
 */
export function collapseRuns(word: string): string {
  return word.replace(/(.)\1+/gu, "$1");
}

function wordPattern(word: string): string {
  return `|${collapseRuns(word.toLowerCase())}|`;
}

function matcherFor(words: readonly string[], severity: PhraseMeta["severity"]) {
  const set = new DataSet<PhraseMeta>();
  for (const word of words) {
    set.addPhrase((phrase) =>
      phrase.setMetadata({ severity }).addPattern(parseRawPattern(wordPattern(word))),
    );
  }
  return new RegExpMatcher({ ...set.build(), ...englishRecommendedTransformers });
}

/** Dataset inglese (gia' resistente a leetspeak e confusables) + parole italiane. */
const blockedMatcher = (() => {
  const set = new DataSet<PhraseMeta>().addAll(
    englishDataset as unknown as DataSet<PhraseMeta>,
  );
  for (const word of IT_BLOCKED_WORDS) {
    set.addPhrase((phrase) =>
      phrase.setMetadata({ severity: "blocked" }).addPattern(parseRawPattern(wordPattern(word))),
    );
  }
  for (const term of IT_WHITELIST) {
    set.addPhrase((phrase) =>
      phrase.setMetadata({ severity: "blocked" }).addWhitelistedTerm(term),
    );
  }
  return new RegExpMatcher({ ...set.build(), ...englishRecommendedTransformers });
})();

const suspectMatcher = matcherFor(IT_SUSPECT_WORDS, "suspect");

/* ------------------------------------------------------------------ */
/* Euristiche di spam. Non bloccano: mandano all'operatore.            */
/* ------------------------------------------------------------------ */

const SPAM_HEURISTICS: ReadonlyArray<{ test: RegExp; reason: string }> = [
  { test: /\b(?:https?:\/\/|www\.)\S+/iu, reason: "link" },
  { test: /\b[a-z0-9-]+\.(?:com|it|net|org|io|co|me|ly|link|xyz|top|shop)\b/iu, reason: "link" },
  { test: /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/iu, reason: "email" },
  /** 8+ cifre, anche separate da spazi, punti o trattini. */
  { test: /(?:\d[\s.\-/]?){8,}/u, reason: "numero di telefono" },
  { test: /(?:^|\s)@[a-z0-9._]{3,}/iu, reason: "handle social" },
  {
    test: /\b(?:t\.me|telegram|whatsapp|wa\.me|onlyfans|bit\.ly)\b/iu,
    reason: "invito su altra piattaforma",
  },
];

/** Una sola parola ripetuta ("forza forza forza forza forza forza"). */
function isRepetitive(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length < 6) return false;
  return new Set(words).size <= Math.ceil(words.length / 4);
}

export function filterMessage(body: string, name: string | null): FilterResult {
  const haystack = name ? `${body} ${name}` : body;

  /**
   * Perche' due passate.
   *
   * `obscenity` valuta i confini di parola sul testo ORIGINALE, non su quello
   * trasformato: "cazzooooo" collassa a "cazo" ma il carattere successivo nel
   * testo vero e' ancora una "o", quindi il confine finale non regge e il
   * match salta. Ripetere una lettera in coda basterebbe ad aggirare tutto.
   * Confrontando anche la versione gia' collassata il buco si chiude, e la
   * passata sul testo naturale continua a far funzionare la whitelist.
   */
  const collapsed = collapseRuns(haystack);
  const matches = (m: RegExpMatcher) => m.hasMatch(haystack) || m.hasMatch(collapsed);

  if (matches(blockedMatcher)) {
    return { verdict: "blocked", reasons: ["linguaggio offensivo"] };
  }
  for (const { test, reason } of IT_BLOCKED_PHRASES) {
    if (test.test(haystack)) return { verdict: "blocked", reasons: [reason] };
  }

  const reasons: string[] = [];

  if (matches(suspectMatcher)) reasons.push("volgarita'");
  for (const { test, reason } of IT_SUSPECT_PHRASES) {
    if (test.test(haystack)) reasons.push(reason);
  }
  for (const { test, reason } of SPAM_HEURISTICS) {
    if (test.test(haystack)) reasons.push(reason);
  }
  if (isRepetitive(body)) reasons.push("testo ripetitivo");

  return {
    verdict: reasons.length > 0 ? "suspect" : "clean",
    reasons: [...new Set(reasons)],
  };
}
