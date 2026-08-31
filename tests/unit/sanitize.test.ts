import { describe, expect, it } from "vitest";

import {
  countGraphemes,
  hasLetters,
  sanitizeName,
  sanitizeText,
  truncateGraphemes,
} from "@/lib/domain/sanitize";

describe("sanitizeText", () => {
  it("collassa spazi e a capo su una riga sola", () => {
    expect(sanitizeText("  ciao\n\n\n   mondo  ")).toBe("ciao mondo");
  });

  it("rimuove i caratteri bidirezionali", () => {
    // RLO fa leggere il testo al contrario sullo schermo: l'operatore
    // approverebbe una cosa e il pubblico ne leggerebbe un'altra.
    const attack = `ciao\u202Eodnom`;
    expect(sanitizeText(attack)).toBe("ciaoodnom");
    expect(sanitizeText(attack)).not.toContain("\u202E");
  });

  it("rimuove zero-width e BOM usati per aggirare i filtri", () => {
    expect(sanitizeText("ca\u200Bzzo")).toBe("cazzo");
    expect(sanitizeText("\uFEFFciao")).toBe("ciao");
  });

  it("taglia lo zalgo che sfonderebbe il layout in verticale", () => {
    const zalgo = "a" + "\u0300\u0301\u0302\u0303\u0304\u0305" + "b";
    const clean = sanitizeText(zalgo);
    const marks = [...clean].filter((c) => /\p{M}/u.test(c)).length;
    expect(marks).toBeLessThanOrEqual(1);
    // NFKC ricompone "a" + accento in un solo carattere: cio' che conta e'
    // che restino due grafemi, non una colonna verticale di segni.
    expect(countGraphemes(clean)).toBe(2);
    expect(clean.endsWith("b")).toBe(true);
  });

  it("limita i caratteri ripetuti", () => {
    expect(sanitizeText("GRANDIIIIIIIIII")).toBe("GRANDIII");
    expect(sanitizeText("bravi!!!!!!!!!!")).toBe("bravi!!!");
  });

  it("lascia intatto un messaggio normale", () => {
    const ok = "Grazie per questa serata incredibile! 🤘";
    expect(sanitizeText(ok)).toBe(ok);
  });

  it("rimuove i control chars", () => {
    expect(sanitizeText("ciao\u0007mondo")).toBe("ciaomondo");
  });
});

describe("sanitizeName", () => {
  it("toglie la punteggiatura decorativa", () => {
    expect(sanitizeName("<<Marco>>")).toBe("Marco");
    expect(sanitizeName("~Anna~")).toBe("Anna");
  });
});

describe("countGraphemes", () => {
  it("conta un'emoji come un carattere", () => {
    // "🤘" e' 2 UTF-16 code unit: senza Intl.Segmenter il contatore del
    // telefono e la validazione del server darebbero numeri diversi.
    expect("🤘".length).toBe(2);
    expect(countGraphemes("🤘")).toBe(1);
  });

  it("conta un'emoji con modificatore come un carattere", () => {
    const emoji = "👨\u200D👩\u200D👧\u200D👦";
    expect(emoji.length).toBeGreaterThan(4);
    expect(countGraphemes(emoji)).toBe(1);
  });

  it("conta le lettere accentate come un carattere", () => {
    expect(countGraphemes("perché")).toBe(6);
  });
});

describe("truncateGraphemes", () => {
  it("non spezza un'emoji a meta'", () => {
    const out = truncateGraphemes("ciao🤘🤘", 5);
    expect(countGraphemes(out)).toBe(5);
    expect(out).toBe("ciao🤘");
  });

  it("lascia stare le stringhe gia' corte", () => {
    expect(truncateGraphemes("ciao", 10)).toBe("ciao");
  });
});

describe("hasLetters", () => {
  it("rifiuta messaggi fatti solo di simboli", () => {
    expect(hasLetters("!!!???")).toBe(false);
    expect(hasLetters("🤘🤘🤘")).toBe(false);
    expect(hasLetters("ciao")).toBe(true);
  });
});
