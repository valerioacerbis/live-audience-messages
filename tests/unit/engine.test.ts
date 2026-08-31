import { describe, expect, it } from "vitest";

import { publicConfig } from "@/lib/config.public";
import { displayReducer, initialDisplayState, type DisplayState } from "@/lib/display/engine";
import { holdDurationMs } from "@/lib/display/timing";
import type { PublicMessage } from "@/lib/domain/types";

const T0 = 1_000_000;

function msg(id: string, offsetMs = 0, body = "Grazie per la serata"): PublicMessage {
  return {
    id,
    body,
    name: null,
    createdAt: new Date(T0 + offsetMs).toISOString(),
    releasedAt: new Date(T0 + offsetMs).toISOString(),
  };
}

function ingest(state: DisplayState, messages: PublicMessage[], now: number): DisplayState {
  return displayReducer(state, { type: "ingest", messages, now });
}

/** Fa avanzare l'engine fino a `until`, come farebbe il loop di rendering. */
function run(state: DisplayState, from: number, until: number, stepMs = 50): DisplayState {
  let current = state;
  for (let t = from; t <= until; t += stepMs) {
    current = displayReducer(current, { type: "tick", now: t });
  }
  return current;
}

describe("ingest", () => {
  it("manda subito in scena il primo messaggio su schermo fermo", () => {
    const state = ingest(initialDisplayState(), [msg("a")], T0);
    expect(state.phase).toBe("entering");
    expect(state.current?.id).toBe("a");
    expect(state.queue).toHaveLength(0);
  });

  it("scarta i duplicati", () => {
    // Dopo una riconnessione il display rilegge un po' indietro: senza dedup
    // lo stesso messaggio comparirebbe due volte sul maxischermo.
    let state = ingest(initialDisplayState(), [msg("a"), msg("b", 10)], T0);
    state = ingest(state, [msg("a"), msg("b", 10), msg("c", 20)], T0);

    expect(state.stats.received).toBe(3);
    expect(state.queue.map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("ordina per releasedAt anche se l'API li restituisce mescolati", () => {
    const state = ingest(initialDisplayState(), [msg("c", 300), msg("a", 100), msg("b", 200)], T0);
    expect(state.current?.id).toBe("a");
    expect(state.queue.map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("fa avanzare il cursore al releasedAt piu' recente", () => {
    const state = ingest(initialDisplayState(), [msg("a", 100), msg("b", 500)], T0);
    expect(state.cursor).toBe(new Date(T0 + 500).toISOString());
  });

  it("avanza il cursore anche quando sono tutti duplicati", () => {
    let state = ingest(initialDisplayState(), [msg("a", 100)], T0);
    const before = state.cursor;
    state = ingest(state, [msg("a", 100), msg("a", 100)], T0);
    expect(state.cursor).toBe(before);
    expect(state.stats.received).toBe(1);
  });

  it("non lascia crescere la coda all'infinito", () => {
    const flood = Array.from({ length: publicConfig.display.maxQueueLength + 50 }, (_, i) =>
      msg(`m${i}`, i),
    );
    const state = ingest(initialDisplayState(), flood, T0);
    expect(state.queue.length).toBeLessThanOrEqual(publicConfig.display.maxQueueLength);
    expect(state.stats.dropped).toBeGreaterThan(0);
  });
});

describe("ciclo di visualizzazione", () => {
  it("attraversa entering -> holding -> exiting -> messaggio successivo", () => {
    let state = ingest(initialDisplayState(), [msg("a"), msg("b", 10)], T0);
    expect(state.phase).toBe("entering");

    state = run(state, T0, T0 + publicConfig.display.enterMs);
    expect(state.phase).toBe("holding");

    const hold = holdDurationMs(state.current?.body.length ?? 0, state.queue.length);
    state = run(state, T0, T0 + publicConfig.display.enterMs + hold + 10);
    expect(state.phase).toBe("exiting");

    state = run(state, T0, T0 + 60_000);
    expect(state.stats.displayed).toBeGreaterThanOrEqual(1);
  });

  it("smaltisce tutta la coda senza mai lasciare lo schermo vuoto", () => {
    const messages = Array.from({ length: 5 }, (_, i) => msg(`m${i}`, i));
    let state = ingest(initialDisplayState(), messages, T0);
    state = run(state, T0, T0 + 300_000, 100);

    // Tutti mostrati almeno una volta, coda vuota...
    expect(state.stats.displayed).toBe(5);
    expect(state.queue).toHaveLength(0);
    // ...ma qualcosa resta in scena: subentra la rotazione.
    expect(state.current).not.toBeNull();
  });

  it("accumula tutti i messaggi in `all` per lo STEP 2", () => {
    const messages = Array.from({ length: 4 }, (_, i) => msg(`m${i}`, i));
    let state = ingest(initialDisplayState(), messages, T0);
    state = run(state, T0, T0 + 300_000, 100);

    expect(state.all.map((m) => m.id)).toEqual(["m0", "m1", "m2", "m3"]);
  });
});

describe("gestione dei burst", () => {
  it("accorcia il tempo a schermo quando la coda cresce", () => {
    const calm = holdDurationMs(80, 0);
    const busy = holdDurationMs(80, publicConfig.display.burstSaturation);
    expect(busy).toBeLessThan(calm);
    expect(busy).toBe(publicConfig.display.holdMinMs);
  });

  it("non scende mai sotto il minimo leggibile", () => {
    const extreme = holdDurationMs(280, 10_000);
    expect(extreme).toBeGreaterThanOrEqual(publicConfig.display.holdMinMs);
  });

  it("smaltisce 50 messaggi in pochi minuti senza perderne nessuno", () => {
    // Lo scenario dichiarato: 50 messaggi in pochi secondi.
    const burst = Array.from({ length: 50 }, (_, i) => msg(`b${i}`, i * 100));
    let state = ingest(initialDisplayState(), burst, T0);
    state = run(state, T0, T0 + 10 * 60_000, 100);

    expect(state.stats.displayed).toBe(50);
    expect(state.stats.dropped).toBe(0);
    expect(state.all).toHaveLength(50);
  });

  it("mantiene l'ordine di arrivo sotto burst", () => {
    const burst = Array.from({ length: 10 }, (_, i) => msg(`b${i}`, i * 100));
    let state = ingest(initialDisplayState(), burst, T0);
    state = run(state, T0, T0 + 5 * 60_000, 100);

    expect(state.all.map((m) => m.id)).toEqual(burst.map((m) => m.id));
  });
});

describe("interventi dell'operatore", () => {
  it("toglie subito dallo schermo un messaggio ritirato", () => {
    let state = ingest(initialDisplayState(), [msg("a"), msg("b", 10)], T0);
    state = run(state, T0, T0 + publicConfig.display.enterMs);
    expect(state.phase).toBe("holding");

    state = displayReducer(state, { type: "remove", id: "a", now: T0 + 1000 });
    expect(state.phase).toBe("exiting");
  });

  it("toglie dalla coda un messaggio non ancora mostrato", () => {
    let state = ingest(initialDisplayState(), [msg("a"), msg("b", 10), msg("c", 20)], T0);
    state = displayReducer(state, { type: "remove", id: "c", now: T0 });
    expect(state.queue.map((m) => m.id)).toEqual(["b"]);
  });

  it("il panic button svuota lo schermo senza far rientrare lo storico", () => {
    let state = ingest(initialDisplayState(), [msg("a"), msg("b", 10)], T0);
    const cursor = state.cursor;

    state = displayReducer(state, { type: "clear", now: T0 });
    expect(state.current).toBeNull();
    expect(state.queue).toHaveLength(0);
    expect(state.phase).toBe("idle");

    // Il cursore e la memoria dei visti sopravvivono: al poll successivo non
    // deve rientrare tutto quello che era gia' passato.
    expect(state.cursor).toBe(cursor);
    state = ingest(state, [msg("a"), msg("b", 10)], T0 + 2000);
    expect(state.queue).toHaveLength(0);
  });
});

describe("resilienza di rete", () => {
  it("recupera il buco dopo una disconnessione, in ordine e senza doppioni", () => {
    let state = ingest(initialDisplayState(), [msg("a", 0)], T0);
    state = run(state, T0, T0 + 30_000, 100);

    // Rete assente per un po', poi la GET restituisce tutto l'arretrato
    // sovrapponendosi a quanto gia' visto.
    const backlog = [msg("a", 0), msg("b", 1000), msg("c", 2000), msg("d", 3000)];
    state = ingest(state, backlog, T0 + 30_000);

    expect(state.stats.received).toBe(4);
    state = run(state, T0 + 30_000, T0 + 300_000, 100);
    expect(state.all.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("un tick senza niente in coda non cambia stato", () => {
    const state = initialDisplayState();
    expect(displayReducer(state, { type: "tick", now: T0 })).toBe(state);
  });
});

describe("cache locale di ripartenza a freddo", () => {
  it("il primo ingest vero corregge una cache stantia (es. messaggi cancellati)", () => {
    // La scheda non era aperta quando i messaggi sono stati eliminati: la
    // cache locale mostra ancora quelli vecchi finche' la rete non risponde.
    let state = displayReducer(initialDisplayState(), {
      type: "restoreCache",
      messages: [msg("stale-1", 0), msg("stale-2", 100)],
      now: T0,
    });
    expect(state.all.map((m) => m.id)).toEqual(["stale-1", "stale-2"]);
    expect(state.hydrated).toBe(false);

    // Il server, interrogato da zero (nessun cursore ancora confermato),
    // dice che oggi non c'e' nulla: i messaggi vecchi devono sparire, non
    // restare per sempre perche' "nessuno ha detto di toglierli".
    state = ingest(state, [], T0 + 500);
    expect(state.all).toEqual([]);
    expect(state.queue).toEqual([]);
    expect(state.hydrated).toBe(true);
  });

  it("il primo ingest vero sostituisce, non somma, se la cache aveva indovinato solo in parte", () => {
    let state = displayReducer(initialDisplayState(), {
      type: "restoreCache",
      messages: [msg("stale", 0)],
      now: T0,
    });

    state = ingest(state, [msg("real", 100)], T0 + 500);

    // "stale" non era confermato dal server: non deve comparire nella
    // rotazione insieme a "real".
    expect(state.all.map((m) => m.id)).not.toContain("stale");
    expect([state.current?.id, ...state.queue.map((m) => m.id)]).toContain("real");
  });

  it("dopo l'idratazione, ingest torna a sommarsi normalmente", () => {
    let state = ingest(initialDisplayState(), [msg("a", 0)], T0);
    expect(state.hydrated).toBe(true);

    state = ingest(state, [msg("b", 100)], T0 + 500);
    // "a" e' gia' in scena (non ancora mostrato del tutto, quindi non e'
    // finito in `all`): "b" deve sommarsi in coda, non sostituirlo.
    expect(state.current?.id).toBe("a");
    expect(state.queue.map((m) => m.id)).toEqual(["b"]);
  });

  it("restoreCache non fa nulla se e' gia' arrivata una risposta vera dal server", () => {
    const hydrated = ingest(initialDisplayState(), [msg("real", 0)], T0);
    const after = displayReducer(hydrated, {
      type: "restoreCache",
      messages: [msg("stale", 0)],
      now: T0 + 500,
    });
    expect(after).toBe(hydrated);
  });
});

describe("rotazione", () => {
  it("continua a mostrare i messaggi passati quando non ne arrivano di nuovi", () => {
    let state = ingest(initialDisplayState(), [msg("a", 0), msg("b", 100)], T0);
    state = run(state, T0, T0 + 120_000, 100);

    // Entrambi mostrati una volta sola come "nuovi", ma lo schermo e' pieno.
    expect(state.stats.displayed).toBe(2);
    expect(state.current).not.toBeNull();
    expect(state.isReplay).toBe(true);
  });

  it("non ripete lo stesso messaggio due volte di fila", () => {
    let state = ingest(initialDisplayState(), [msg("a", 0), msg("b", 100)], T0);

    const sequence: string[] = [];
    let previous: string | null = null;
    for (let t = T0; t <= T0 + 180_000; t += 100) {
      state = displayReducer(state, { type: "tick", now: t });
      const id = state.current?.id ?? null;
      if (id && id !== previous) sequence.push(id);
      previous = id;
    }

    expect(sequence.length).toBeGreaterThan(4);
    for (let i = 1; i < sequence.length; i++) {
      expect(sequence[i]).not.toBe(sequence[i - 1]);
    }
  });

  it("con un solo messaggio lo lascia in scena invece di farlo lampeggiare", () => {
    let state = ingest(initialDisplayState(), [msg("solo", 0)], T0);
    state = run(state, T0, T0 + 120_000, 100);

    expect(state.current?.id).toBe("solo");
    expect(state.phase).toBe("holding");
  });

  it("un messaggio nuovo ha la precedenza sulla rotazione", () => {
    let state = ingest(initialDisplayState(), [msg("a", 0), msg("b", 100)], T0);
    state = run(state, T0, T0 + 60_000, 100);
    expect(state.isReplay).toBe(true);

    const duringReplay = state.current?.id;
    state = ingest(state, [msg("nuovo", 200_000)], T0 + 60_000);

    // Il messaggio in scena finisce il suo turno, ma il PROSSIMO deve essere
    // l'arrivo nuovo, non un altro giro di rotazione.
    let nextShown: string | undefined;
    for (let t = T0 + 60_000; t <= T0 + 90_000; t += 100) {
      state = displayReducer(state, { type: "tick", now: t });
      const id = state.current?.id;
      if (id && id !== duringReplay) {
        nextShown = id;
        break;
      }
    }

    expect(nextShown).toBe("nuovo");
    expect(state.isReplay).toBe(false);
  });

  it("le ripetizioni non gonfiano il conteggio dei messaggi mostrati", () => {
    let state = ingest(initialDisplayState(), [msg("a", 0), msg("b", 100)], T0);
    state = run(state, T0, T0 + 600_000, 100);

    expect(state.stats.displayed).toBe(2);
    expect(state.all).toHaveLength(2);
  });

  it("ogni giro mostra tutti i messaggi una volta, ma l'ordine cambia da un giro all'altro", () => {
    const messages = Array.from({ length: 6 }, (_, i) => msg(`m${i}`, i));
    const ids = new Set(messages.map((m) => m.id));
    let state = ingest(initialDisplayState(), messages, T0);

    // Sequenza dei soli arrivi in rotazione (isReplay), deduplicata sulle
    // transizioni: cosi' ignoriamo sia lo smaltimento iniziale della coda
    // (che non e' rotazione) sia il fatto di ricampionare lo stesso "current"
    // a ogni tick mentre resta in scena.
    const shown: string[] = [];
    let previous: string | null = null;
    for (let t = T0; t <= T0 + 300_000; t += 100) {
      state = displayReducer(state, { type: "tick", now: t });
      const id = state.current?.id ?? null;
      if (id && id !== previous && state.isReplay) shown.push(id);
      previous = id;
    }

    // Raggruppa greedily in giri: un giro si chiude quando ha mostrato tutti
    // gli id una volta. Se un id si ripetesse prima che il giro sia completo,
    // il Set del giro in corso non conterrebbe piu' size 6 alla chiusura, e il
    // controllo sotto lo scoprirebbe.
    const laps: string[][] = [[]];
    let remaining = new Set(ids);
    for (const id of shown) {
      const currentLap = laps[laps.length - 1];
      currentLap?.push(id);
      remaining.delete(id);
      if (remaining.size === 0) {
        remaining = new Set(ids);
        if (laps.length < 3) laps.push([]);
      }
    }

    expect(laps).toHaveLength(3);
    for (const lap of laps) {
      expect(new Set(lap)).toEqual(ids);
    }

    // Con 6! ordini possibili, due giri identici per puro caso sono
    // trascurabili: se capitasse davvero significherebbe che il pareggio
    // casuale tra i "meno mostrati" non sta funzionando.
    expect(laps[0]?.join(",")).not.toBe(laps[1]?.join(","));
  });
});

describe("ritiro di un messaggio con la rotazione attiva", () => {
  it("un messaggio bloccato non rientra mai dalla rotazione", () => {
    // La trappola: senza toglierlo anche dallo storico, il messaggio che
    // l'operatore ha appena ritirato tornerebbe a schermo qualche minuto dopo.
    let state = ingest(initialDisplayState(), [msg("a", 0), msg("brutto", 100)], T0);
    state = run(state, T0, T0 + 30_000, 100);

    state = displayReducer(state, { type: "remove", id: "brutto", now: T0 + 30_000 });
    expect(state.all.map((m) => m.id)).not.toContain("brutto");

    state = run(state, T0 + 30_000, T0 + 300_000, 100);
    expect(state.all.map((m) => m.id)).not.toContain("brutto");
    expect(state.current?.id).not.toBe("brutto");
  });

  it("il panic button svuota anche la rotazione", () => {
    let state = ingest(initialDisplayState(), [msg("a", 0), msg("b", 100)], T0);
    state = run(state, T0, T0 + 30_000, 100);

    state = displayReducer(state, { type: "clear", now: T0 + 30_000 });
    expect(state.all).toHaveLength(0);
    expect(state.current).toBeNull();

    // E non deve ripartire da sola pescando dallo storico.
    state = run(state, T0 + 30_000, T0 + 120_000, 100);
    expect(state.current).toBeNull();

    // Il cursore sopravvive: la GET successiva non fa rientrare la serata.
    expect(state.cursor).not.toBeNull();
  });
});
