import { describe, expect, it } from "vitest";

import { collapseRuns, filterMessage } from "@/lib/domain/moderation";
import { IT_BLOCKED_WORDS, IT_SUSPECT_WORDS } from "@/lib/domain/wordlists.it";

const verdict = (body: string, name: string | null = null) => filterMessage(body, name).verdict;

describe("filterMessage - messaggi normali", () => {
  it("lascia passare le dediche vere", () => {
    expect(verdict("Grazie per questa serata incredibile!")).toBe("clean");
    expect(verdict("Auguri amore mio, sei tutto per me")).toBe("clean");
    expect(verdict("Siete i migliori, tornate presto a Brescia")).toBe("clean");
  });

  it("non si fa ingannare dallo Scunthorpe problem", () => {
    // Parole italiane innocue che una wordlist inglese ingenua segnalerebbe.
    expect(verdict("Analisi perfetta del pezzo nuovo")).toBe("clean");
    expect(verdict("Ci vediamo a Bassano")).toBe("clean");
  });
});

describe("filterMessage - contenuti da bloccare", () => {
  it("blocca le slur", () => {
    expect(verdict("sei un frocio")).toBe("blocked");
  });

  it("blocca le minacce dirette", () => {
    expect(verdict("ti ammazzo")).toBe("blocked");
    expect(verdict("vi ammazzo tutti")).toBe("blocked");
    expect(verdict("ti spacco la faccia")).toBe("blocked");
  });

  it("blocca anche quando la slur e' nel nome", () => {
    expect(verdict("Bella serata!", "troia")).toBe("blocked");
  });

  it("resiste al leetspeak", () => {
    expect(verdict("sei un fr0c10")).toBe("blocked");
  });
});

describe("filterMessage - contenuti da far vedere a un umano", () => {
  it("segnala la volgarita' leggera senza bloccarla", () => {
    // A un concerto rock questo e' entusiasmo, non un problema: va valutato,
    // non rifiutato a priori.
    const result = filterMessage("che cazzo di concerto ragazzi", null);
    expect(result.verdict).toBe("suspect");
    expect(result.reasons).toContain("volgarita'");
  });

  it("segnala i link", () => {
    const result = filterMessage("seguitemi su miosito.com", null);
    expect(result.verdict).toBe("suspect");
    expect(result.reasons).toContain("link");
  });

  it("segnala i numeri di telefono", () => {
    expect(verdict("chiamami 333 1234567")).toBe("suspect");
  });

  it("segnala gli inviti su altre piattaforme", () => {
    expect(verdict("scrivimi su whatsapp")).toBe("suspect");
  });

  it("segnala le email", () => {
    expect(verdict("scrivimi a tizio@example.com")).toBe("suspect");
  });

  it("segnala il testo ripetitivo", () => {
    expect(verdict("forza forza forza forza forza forza forza")).toBe("suspect");
  });

  it("non scambia un coro legittimo per spam", () => {
    expect(verdict("Forza ragazzi siete grandi davvero")).toBe("clean");
  });
});

describe("integrita' delle liste", () => {
  // I transformer di obscenity collassano le lettere ripetute: un pattern
  // scritto nella grafia normale non aggancia niente, e fallisce in silenzio.
  // Questo test e' la rete che impedisce a una voce di essere li' per finta.

  it("ogni parola bloccata reagisce alla propria grafia naturale", () => {
    const inerti = IT_BLOCKED_WORDS.filter((w) => verdict(w) !== "blocked");
    expect(inerti).toEqual([]);
  });

  it("ogni parola sospetta reagisce alla propria grafia naturale", () => {
    const inerti = IT_SUSPECT_WORDS.filter((w) => verdict(w) === "clean");
    expect(inerti).toEqual([]);
  });

  it("resiste al letter flooding", () => {
    expect(verdict("caaaaazzzzooooo")).toBe("suspect");
  });

  it("collapseRuns riduce le ripetizioni a un solo carattere", () => {
    expect(collapseRuns("cazzo")).toBe("cazo");
    expect(collapseRuns("puttana")).toBe("putana");
    expect(collapseRuns("negro")).toBe("negro");
  });
});
