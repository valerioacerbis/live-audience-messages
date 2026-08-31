import { describe, expect, it } from "vitest";

import { publicConfig } from "@/lib/config.public";
import { countGraphemes } from "@/lib/domain/sanitize";
import {
  countAvailablePhrases,
  pickSyntheticPhrases,
  SYNTHETIC_PHRASES,
} from "@/lib/domain/syntheticPhrases";

/** rng deterministico, cosi' i test non dipendono da Math.random. */
function fixedRng(sequence: number[]): () => number {
  let i = 0;
  return () => sequence[i++ % sequence.length]!;
}

const bodies = () => SYNTHETIC_PHRASES.map((p) => p.body);

describe("SYNTHETIC_PHRASES", () => {
  it("rispetta il limite di caratteri del form pubblico", () => {
    for (const phrase of SYNTHETIC_PHRASES) {
      expect(countGraphemes(phrase.body)).toBeLessThanOrEqual(
        publicConfig.limits.messageMaxLength,
      );
      if (phrase.name) {
        expect(countGraphemes(phrase.name)).toBeLessThanOrEqual(publicConfig.limits.nameMaxLength);
      }
    }
  });

  it("non ha duplicati nel pool", () => {
    expect(new Set(bodies()).size).toBe(SYNTHETIC_PHRASES.length);
  });

  it("non le fa sembrare tutte uguali: non tutte iniziano allo stesso modo", () => {
    // La lamentela che ha originato questo test: troppe frasi che iniziano
    // con "Prometto di...", riconoscibili a colpo d'occhio come stampino.
    const sameOpener = SYNTHETIC_PHRASES.filter((p) =>
      p.body.toLowerCase().startsWith("prometto"),
    );
    expect(sameOpener.length).toBeLessThan(SYNTHETIC_PHRASES.length / 4);
  });

  it("ha un nome proprio solo su una parte delle frasi, mai su tutte ne' su nessuna", () => {
    const withName = SYNTHETIC_PHRASES.filter((p) => p.name !== null);
    expect(withName.length).toBeGreaterThan(0);
    expect(withName.length).toBeLessThan(SYNTHETIC_PHRASES.length);
  });
});

describe("pickSyntheticPhrases", () => {
  it("restituisce esattamente il numero richiesto quando il pool basta", () => {
    const result = pickSyntheticPhrases([], 10, fixedRng([0.1, 0.5, 0.9]));
    expect(result).toHaveLength(10);
  });

  it("non ripete frasi all'interno dello stesso lotto", () => {
    const result = pickSyntheticPhrases([], 10, fixedRng([0.1, 0.3, 0.6, 0.9]));
    expect(new Set(result.map((p) => p.body)).size).toBe(result.length);
  });

  it("evita le frasi gia' usate", () => {
    const used = bodies().slice(0, 5);
    const result = pickSyntheticPhrases(used, 10, fixedRng([0.2, 0.7]));
    for (const phrase of result) {
      expect(used).not.toContain(phrase.body);
    }
  });

  it("una volta esaurito il pool restituisce meno frasi di quante richieste, mai una ripetuta", () => {
    // Solo 3 frasi ancora inedite: niente ripescaggio dal resto del pool.
    const used = bodies().slice(0, SYNTHETIC_PHRASES.length - 3);
    const result = pickSyntheticPhrases(used, 10, fixedRng([0.3, 0.6]));

    expect(result).toHaveLength(3);
    for (const phrase of result) {
      expect(used).not.toContain(phrase.body);
    }
  });

  it("con il pool interamente usato non restituisce nulla", () => {
    const result = pickSyntheticPhrases(bodies(), 10, fixedRng([0.5]));
    expect(result).toHaveLength(0);
  });
});

describe("countAvailablePhrases", () => {
  it("con nessuna frase usata conta l'intero pool", () => {
    expect(countAvailablePhrases([])).toBe(SYNTHETIC_PHRASES.length);
  });

  it("scende con l'uso e arriva a zero quando il pool e' esaurito", () => {
    expect(countAvailablePhrases(bodies().slice(0, 10))).toBe(SYNTHETIC_PHRASES.length - 10);
    expect(countAvailablePhrases(bodies())).toBe(0);
  });
});
