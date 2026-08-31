import { describe, expect, it } from "vitest";

import { splitGraphemes } from "@/lib/display/graphemes";
import { letterDelayMs } from "@/lib/display/letterStagger";

describe("letterDelayMs", () => {
  it("non ritarda affatto un testo di una sola lettera", () => {
    expect(letterDelayMs(0, 1, 500)).toBe(0);
  });

  it("la prima lettera parte subito, l'ultima esattamente al budget", () => {
    const budgetMs = 500;
    const total = 12;

    expect(letterDelayMs(0, total, budgetMs)).toBe(0);
    expect(letterDelayMs(total - 1, total, budgetMs)).toBe(budgetMs);
  });

  it("nessuna lettera supera mai il budget assegnato", () => {
    for (const budgetMs of [0, 180, 500, 650]) {
      for (const total of [1, 2, 10, 50, 280]) {
        const lastDelay = letterDelayMs(total - 1, total, budgetMs);
        expect(lastDelay).toBeLessThanOrEqual(budgetMs);
      }
    }
  });

  it("distribuisce il ritardo in modo proporzionale, non a passo fisso", () => {
    const budgetMs = 500;
    const total = 5;

    const delays = Array.from({ length: total }, (_, i) => letterDelayMs(i, total, budgetMs));
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThanOrEqual(delays[i - 1]!);
    }
  });
});

describe("splitGraphemes", () => {
  it("spezza una parola semplice lettera per lettera", () => {
    expect(splitGraphemes("ciao")).toEqual(["c", "i", "a", "o"]);
  });

  it("tiene intera un'emoji composta invece di disintegrarla", () => {
    const familyEmoji = "\u{1F468}‍\u{1F469}‍\u{1F467}"; // 👨‍👩‍👧
    expect(splitGraphemes(familyEmoji)).toEqual([familyEmoji]);
  });

  it("conta un'emoji semplice come un solo grafema", () => {
    expect(splitGraphemes("ciao👋")).toEqual(["c", "i", "a", "o", "👋"]);
  });
});
