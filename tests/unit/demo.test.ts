import { resolve } from "node:path";

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

import { publicConfig } from "@/lib/config.public";
import { isToggleKey } from "@/lib/display/demoToggleKey";
import { demoMessages } from "@/lib/domain/demoFeed";
import { SYNTHETIC_PHRASES } from "@/lib/domain/syntheticPhrases";
import { displayReducer, initialDisplayState, type DisplayState } from "@/lib/display/engine";

const ROOT = resolve(import.meta.dirname, "../..");

describe("demoMessages", () => {
  it("porta tutte le frasi pre-scritte, con id propri e unici", () => {
    const messages = demoMessages();
    expect(messages).toHaveLength(SYNTHETIC_PHRASES.length);
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length);
    for (const message of messages) expect(message.id).toMatch(/^demo-\d+$/);
    expect(messages.map((m) => m.body)).toEqual(SYNTHETIC_PHRASES.map((p) => p.body));
  });
});

describe("motore in modalita' demo", () => {
  /** Fa girare l'orologio e registra l'ordine in cui i messaggi entrano in scena. */
  function run(state: DisplayState, from: number, durationMs: number) {
    const shown: string[] = [];
    let maxQueue = 0;
    for (let now = from; now < from + durationMs; now += 50) {
      const prev = state;
      state = displayReducer(state, { type: "tick", now });
      maxQueue = Math.max(maxQueue, state.queue.length);
      if (state.phase === "entering" && (prev.phase !== "entering" || prev.current !== state.current)) {
        shown.push(state.current!.id);
      }
    }
    return { state, shown, maxQueue };
  }

  function seeded(now: number): DisplayState {
    return displayReducer(initialDisplayState(), {
      type: "restoreCache",
      messages: demoMessages(),
      now,
    });
  }

  it("parte subito, dalla rotazione e non dalla coda dei nuovi", () => {
    const state = seeded(0);
    expect(state.current).not.toBeNull();
    expect(state.isReplay).toBe(true);
    // Coda vuota: i tempi a schermo restano quelli pieni, non compressi come
    // davanti a un'ondata di 40 arrivi.
    expect(state.queue).toHaveLength(0);
  });

  it("mostra tutte le frasi prima di ripeterne una, e non ne ripete mai una due volte di fila", () => {
    const first = seeded(0);
    const { shown, maxQueue } = run(first, 0, 40 * 60_000);
    const sequence = [first.current!.id, ...shown];

    const total = SYNTHETIC_PHRASES.length;
    expect(sequence.length).toBeGreaterThan(total * 2);
    expect(new Set(sequence.slice(0, total)).size).toBe(total);
    for (let i = 1; i < sequence.length; i++) expect(sequence[i]).not.toBe(sequence[i - 1]);
    expect(maxQueue).toBe(0);
  });
});

describe("tasti del display (piano B e chiusura)", () => {
  const press = (key: string, extra: Partial<Parameters<typeof isToggleKey>[0]> = {}) => ({
    key,
    repeat: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...extra,
  });

  it("scatta con il tasto configurato, anche col Caps Lock acceso", () => {
    expect(isToggleKey(press("x"), "x")).toBe(true);
    expect(isToggleKey(press("X"), "x")).toBe(true);
    expect(isToggleKey(press("d"), "D")).toBe(true);
  });

  it("ignora gli altri tasti, le scorciatoie di sistema e le ripetizioni", () => {
    expect(isToggleKey(press("z"), "x")).toBe(false);
    expect(isToggleKey(press("x", { metaKey: true }), "x")).toBe(false);
    expect(isToggleKey(press("x", { ctrlKey: true }), "x")).toBe(false);
    expect(isToggleKey(press("x", { altKey: true }), "x")).toBe(false);
    // Tasto tenuto premuto: niente rimbalzo avanti e indietro.
    expect(isToggleKey(press("x", { repeat: true }), "x")).toBe(false);
  });

  it("la chiusura scatta con lo spazio, una volta sola anche se tenuto premuto", () => {
    const space = publicConfig.display.closingToggleKey;
    expect(space).toBe(" ");
    expect(isToggleKey(press(" "), space)).toBe(true);
    expect(isToggleKey(press(" ", { repeat: true }), space)).toBe(false);
    expect(isToggleKey(press("x"), space)).toBe(false);
    // I due interruttori non si pestano i piedi.
    expect(isToggleKey(press(" "), publicConfig.display.demoToggleKey)).toBe(false);
  });
});

describe("la modalita' demo non parla con la rete", () => {
  /**
   * Bundle del solo codice del progetto (le librerie restano esterne), a
   * partire dal punto d'ingresso della demo. Se qualcuno un giorno ci
   * infilasse una fetch, un socket o il client di Supabase, lo scopriamo qui
   * e non la sera del concerto con la rete staccata.
   */
  async function bundle(entry: string): Promise<string> {
    const result = await build({
      entryPoints: [resolve(ROOT, entry)],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      packages: "external",
      jsx: "automatic",
      tsconfig: resolve(ROOT, "tsconfig.json"),
      logLevel: "silent",
    });
    return result.outputFiles[0]!.text;
  }

  const NETWORK = [
    /\bfetch\s*\(/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\bXMLHttpRequest\b/,
    /\bsendBeacon\b/,
    /@supabase\//,
    /\/api\//,
    // Non rete, ma non deve toccare la cache del display vero nello stesso browser.
    /\blocalStorage\b/,
  ];

  it("DemoStage non contiene fetch, socket, client Supabase ne' chiamate alle API", async () => {
    const code = await bundle("src/components/display/DemoStage.tsx");
    for (const pattern of NETWORK) expect(code).not.toMatch(pattern);
  });

  it("il file HTML offline non contiene rete, schermata d'ingresso compresa", async () => {
    const code = await bundle("scripts/offline-demo-entry.tsx");
    for (const pattern of NETWORK) expect(code).not.toMatch(pattern);
  });

  it("controprova: lo stesso controllo sul display vero trova la rete", async () => {
    const code = await bundle("src/components/display/DisplayStage.tsx");
    expect(code).toMatch(/\bfetch\s*\(/);
    expect(code).toMatch(/@supabase\//);
  });
});
