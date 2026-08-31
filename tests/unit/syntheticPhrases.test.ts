import { describe, expect, it } from "vitest";

import { publicConfig } from "@/lib/config.public";
import { countGraphemes } from "@/lib/domain/sanitize";
import { pickSyntheticPhrases, SYNTHETIC_PHRASES } from "@/lib/domain/syntheticPhrases";

/** rng deterministico, cosi' i test non dipendono da Math.random. */
function fixedRng(sequence: number[]): () => number {
  let i = 0;
  return () => sequence[i++ % sequence.length]!;
}

describe("SYNTHETIC_PHRASES", () => {
  it("rispetta il limite di caratteri del form pubblico", () => {
    for (const phrase of SYNTHETIC_PHRASES) {
      expect(countGraphemes(phrase)).toBeLessThanOrEqual(publicConfig.limits.messageMaxLength);
    }
  });

  it("non ha duplicati nel pool", () => {
    expect(new Set(SYNTHETIC_PHRASES).size).toBe(SYNTHETIC_PHRASES.length);
  });
});

describe("pickSyntheticPhrases", () => {
  it("restituisce esattamente il numero richiesto", () => {
    const result = pickSyntheticPhrases([], 10, fixedRng([0.1, 0.5, 0.9]));
    expect(result).toHaveLength(10);
  });

  it("non ripete frasi all'interno dello stesso lotto", () => {
    const result = pickSyntheticPhrases([], 10, fixedRng([0.1, 0.3, 0.6, 0.9]));
    expect(new Set(result).size).toBe(result.length);
  });

  it("evita le frasi gia' usate finche' il pool residuo basta", () => {
    const used = SYNTHETIC_PHRASES.slice(0, 5);
    const result = pickSyntheticPhrases(used, 10, fixedRng([0.2, 0.7]));
    for (const phrase of result) {
      expect(used).not.toContain(phrase);
    }
  });

  it("ripesca dall'intero pool invece di restituire meno frasi di quante richieste", () => {
    // Tutto il pool e' gia' "usato": non c'e' nulla di davvero inedito,
    // ma il pulsante deve comunque produrre `count` frasi valide.
    const used = SYNTHETIC_PHRASES.slice();
    const result = pickSyntheticPhrases(used, 10, fixedRng([0.4, 0.8]));

    expect(result).toHaveLength(10);
    for (const phrase of result) {
      expect(SYNTHETIC_PHRASES).toContain(phrase);
    }
  });

  it("non fallisce chiedendo piu' frasi di quante ce ne siano nel pool", () => {
    const result = pickSyntheticPhrases([], SYNTHETIC_PHRASES.length + 5, fixedRng([0.5]));
    expect(result).toHaveLength(SYNTHETIC_PHRASES.length + 5);
  });
});
