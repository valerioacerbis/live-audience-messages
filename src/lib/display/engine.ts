import { publicConfig } from "../config.public";
import type { PublicMessage } from "../domain/types";
import { holdDurationMs } from "./timing";

/**
 * Motore del display: coda, rotazione, dedup, tempi, macchina a stati.
 *
 * E' un reducer puro, senza React e senza I/O. Due motivi:
 * 1. e' la parte con la logica piu' insidiosa (burst, riconnessioni,
 *    duplicati, rotazione) ed e' quella che voglio poter testare in
 *    millisecondi;
 * 2. e' il confine che permette allo STEP 2 di sostituire il renderer
 *    visuale senza toccare nulla di tutto questo.
 *
 * Un comportamento da tenere a mente leggendo il codice: **lo schermo non
 * torna mai vuoto**. Se non arrivano messaggi nuovi, quelli gia' passati
 * continuano a girare a rotazione; i nuovi hanno sempre la precedenza.
 * Il QR vive su una pagina sua (`/qr`) e qui dentro non esiste.
 */

export type DisplayPhase = "idle" | "entering" | "holding" | "exiting";

export interface DisplayState {
  phase: DisplayPhase;
  current: PublicMessage | null;
  /** Il messaggio in scena e' una ripetizione, non un arrivo nuovo. */
  isReplay: boolean;
  /** Messaggi nuovi, mai mostrati. Hanno la precedenza sulla rotazione. */
  queue: readonly PublicMessage[];
  /**
   * TUTTI i messaggi passati dal display, in ordine.
   *
   * Ha due usi. Il primo e' la rotazione: quando non arriva niente di nuovo,
   * e' da qui che si ripesca. Il secondo e' lo STEP 2: la "rete viva" non
   * mostra UN messaggio, mostra l'insieme accumulato di tutti.
   */
  all: readonly PublicMessage[];
  /**
   * Quante volte ogni messaggio e' andato in scena (arrivo nuovo compreso).
   * La rotazione pesca sempre da qui il meno mostrato: con una canzone
   * lunga e pochi messaggi, e' cosi' che si evita che qualcuno ne veda
   * uno sempre piu' spesso degli altri.
   */
  showCounts: ReadonlyMap<string, number>;
  /** Serve a non ripetere due volte di fila lo stesso messaggio. */
  lastShownId: string | null;
  /** Timestamp di fine della fase corrente (ms epoch). */
  phaseEndsAt: number;
  seenIds: ReadonlySet<string>;
  /** Ultimo `releasedAt` assorbito: e' il cursore verso l'API. */
  cursor: string | null;
  /**
   * Diventa `true` al primo `ingest` che arriva DAVVERO dal server (non dalla
   * cache locale di ripartenza a freddo). Finche' e' `false`, quell'ingest
   * sostituisce lo stato invece di sommarsi: e' cosi' che una cache stantia
   * (es. messaggi cancellati mentre questa scheda non era aperta) viene
   * corretta dalla verita' del server invece di restare a schermo per sempre.
   */
  hydrated: boolean;
  /**
   * La serata e' stata chiusa dal moderatore: chi renderizza lo schermo deve
   * mostrare la schermata di chiusura al posto della rotazione, invece di
   * aggiungerlo come un altro stato della macchina qui dentro — la coda e i
   * tempi restano quelli che erano, semplicemente non contano piu' nulla.
   *
   * Rispecchia sempre la verita' del server (stesso principio "campanella +
   * rilettura" di tutto il resto): se il moderatore riapre la serata per
   * errore o per test, torna `false` da solo al prossimo poll, senza bisogno
   * di ricaricare la pagina.
   */
  ended: boolean;
  /** Frase della schermata di chiusura, aggiornata a ogni sync col server. */
  closingPhrase: string;
  stats: {
    received: number;
    /** Messaggi unici andati a schermo. Le ripetizioni non contano. */
    displayed: number;
    dropped: number;
  };
}

export type DisplayAction =
  | { type: "ingest"; messages: readonly PublicMessage[]; now: number }
  | { type: "restoreCache"; messages: readonly PublicMessage[]; now: number }
  | { type: "tick"; now: number }
  | { type: "remove"; id: string; now: number }
  | { type: "clear"; now: number }
  | { type: "ended"; value: boolean }
  | { type: "closingPhrase"; value: string };

export function initialDisplayState(): DisplayState {
  return {
    phase: "idle",
    current: null,
    isReplay: false,
    queue: [],
    all: [],
    showCounts: new Map(),
    lastShownId: null,
    phaseEndsAt: 0,
    seenIds: new Set(),
    cursor: null,
    hydrated: false,
    ended: false,
    closingPhrase: publicConfig.event.closingPhrase,
    stats: { received: 0, displayed: 0, dropped: 0 },
  };
}

function laterCursor(a: string | null, b: string): string {
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function enter(
  state: DisplayState,
  message: PublicMessage,
  now: number,
  extra: Partial<DisplayState>,
): DisplayState {
  const showCounts = new Map(state.showCounts);
  showCounts.set(message.id, (showCounts.get(message.id) ?? 0) + 1);

  return {
    ...state,
    ...extra,
    phase: "entering",
    current: message,
    lastShownId: message.id,
    showCounts,
    phaseEndsAt: now + publicConfig.display.enterMs,
  };
}

/**
 * Sceglie il prossimo messaggio da mandare in scena.
 *
 * Priorita': prima i nuovi arrivi, poi la rotazione di quelli gia' passati.
 * Cosi' chi ha appena scritto vede comparire il proprio messaggio subito,
 * e nei momenti di calma lo schermo continua comunque a vivere.
 */
function advance(state: DisplayState, now: number): DisplayState {
  if (state.phase !== "idle") return state;

  const [next, ...rest] = state.queue;
  if (next) {
    return enter(state, next, now, {
      queue: rest,
      all: [...state.all, next],
      isReplay: false,
    });
  }

  if (state.all.length === 0) return state;

  const replay = pickReplay(state);
  if (!replay) return state;

  return enter(state, replay, now, { isReplay: true });
}

/**
 * Sceglie il prossimo messaggio da rimettere in scena: sempre tra quelli
 * mostrati meno volte finora, con pareggio casuale. Cosi' ogni messaggio
 * torna a schermo la stessa quantita' di volte degli altri (mai +1 rispetto
 * al meno mostrato), invece di dipendere da un ordine di giro che con una
 * canzone lunga farebbe vedere alcuni messaggi molte piu' volte di altri.
 *
 * Esclude il messaggio appena uscito quando esiste un'alternativa, cosi' non
 * si ripete mai due volte di fila anche se e' lui il meno mostrato.
 */
function pickReplay(state: DisplayState): PublicMessage | null {
  if (state.all.length === 0) return null;

  const pool =
    state.all.length > 1 ? state.all.filter((m) => m.id !== state.lastShownId) : state.all;

  const minCount = pool.reduce(
    (min, m) => Math.min(min, state.showCounts.get(m.id) ?? 0),
    Number.POSITIVE_INFINITY,
  );
  const candidates = pool.filter((m) => (state.showCounts.get(m.id) ?? 0) === minCount);

  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

/** Avanzamento della macchina a stati sul battito dell'orologio. */
function tick(state: DisplayState, now: number): DisplayState {
  if (state.phase === "idle") return advance(state, now);
  if (now < state.phaseEndsAt) return state;

  switch (state.phase) {
    case "entering":
      return {
        ...state,
        phase: "holding",
        phaseEndsAt: now + holdDurationMs(state.current?.body.length ?? 0, state.queue.length),
      };

    case "holding": {
      // Se non c'e' altro da mostrare, il messaggio resta dov'e' invece di
      // uscire su uno schermo vuoto: uscire per poi rientrare da solo sarebbe
      // solo un lampeggio.
      const hasAlternative = state.queue.length > 0 || state.all.length > 1;
      if (!hasAlternative) return state;

      return { ...state, phase: "exiting", phaseEndsAt: now + publicConfig.display.exitMs };
    }

    case "exiting":
      return advance(
        {
          ...state,
          phase: "idle",
          current: null,
          phaseEndsAt: 0,
          stats: {
            ...state.stats,
            // Le ripetizioni non sono messaggi nuovi andati a schermo.
            displayed: state.stats.displayed + (state.isReplay ? 0 : 1),
          },
        },
        now,
      );

    default:
      return state;
  }
}

export function displayReducer(state: DisplayState, action: DisplayAction): DisplayState {
  switch (action.type) {
    case "ingest": {
      // Il primo ingest DAVVERO dal server e' la verita': non si somma a
      // quello che la cache locale aveva ipotizzato, lo sostituisce. Senza
      // questo, messaggi cancellati mentre questa scheda non era aperta
      // resterebbero a schermo per sempre (l'incremento successivo non ha
      // motivo di rimuovere cio' che gia' c'era, sa solo aggiungere).
      const base: DisplayState = state.hydrated
        ? state
        : { ...state, queue: [], all: [], seenIds: new Set(), cursor: null };

      const fresh: PublicMessage[] = [];
      const seen = new Set(base.seenIds);
      let cursor = base.cursor;

      for (const message of action.messages) {
        cursor = laterCursor(cursor, message.releasedAt);
        // Dedup per id: e' la seconda linea di difesa dopo il cursore, e serve
        // davvero, perche' dopo una riconnessione rileggiamo un po' indietro.
        if (seen.has(message.id)) continue;
        seen.add(message.id);
        fresh.push(message);
      }

      if (fresh.length === 0) {
        if (base.hydrated && cursor === base.cursor) return state;
        return { ...base, cursor, hydrated: true };
      }

      // Ordine di rilascio: e' l'ordine in cui il pubblico se li aspetta.
      const queue = [...base.queue, ...fresh].sort((a, b) =>
        a.releasedAt === b.releasedAt
          ? a.id.localeCompare(b.id)
          : a.releasedAt.localeCompare(b.releasedAt),
      );

      const overflow = Math.max(0, queue.length - publicConfig.display.maxQueueLength);

      const ingested: DisplayState = {
        ...base,
        queue: overflow > 0 ? queue.slice(overflow) : queue,
        seenIds: seen,
        cursor,
        hydrated: true,
        stats: {
          ...state.stats,
          received: state.stats.received + fresh.length,
          dropped: state.stats.dropped + overflow,
        },
      };

      // Se lo schermo era fermo, il primo messaggio parte subito.
      return advance(ingested, action.now);
    }

    case "restoreCache": {
      // Solo un placeholder visivo mentre si aspetta la rete: non tocca il
      // cursore ne' segna lo stato come "hydrated", cosi' il prossimo ingest
      // vero lo corregge invece di sommarcisi sopra.
      if (state.hydrated || action.messages.length === 0) return state;
      return advance({ ...state, all: [...action.messages] }, action.now);
    }

    case "tick":
      return tick(state, action.now);

    case "remove": {
      // Ritiro immediato: un messaggio bloccato dall'operatore mentre e' gia'
      // a schermo deve sparire adesso, non alla fine del suo turno.
      //
      // Va tolto ANCHE dallo storico, altrimenti la rotazione lo rimetterebbe
      // in scena qualche minuto dopo: sarebbe il modo peggiore di scoprire
      // che il ritiro non era definitivo.
      const queue = state.queue.filter((m) => m.id !== action.id);
      const all = state.all.filter((m) => m.id !== action.id);
      if (queue.length === state.queue.length && all.length === state.all.length) {
        return state;
      }

      // Anche il contatore "ricevuti" deve tornare indietro: altrimenti resta
      // piu' alto di quello che un ricaricamento della pagina ricalcolerebbe
      // da zero, e i due numeri smettono di coincidere.
      //
      // E va tolto anche da `seenIds`: se poi torna a schermo (approvato di
      // nuovo dopo un ritiro per errore), il suo id non deve piu' risultare
      // "gia' visto", o il dedup dell'ingest lo scarterebbe in silenzio per
      // sempre, come se non fosse mai stato riapprovato.
      const seenIds = new Set(state.seenIds);
      seenIds.delete(action.id);

      const cleaned = {
        ...state,
        queue,
        all,
        seenIds,
        stats: { ...state.stats, received: Math.max(0, state.stats.received - 1) },
      };

      if (state.current?.id === action.id) {
        return {
          ...cleaned,
          phase: "exiting",
          phaseEndsAt: action.now + publicConfig.display.exitMs,
        };
      }
      return cleaned;
    }

    case "clear":
      // Panic button (o "Reset messaggi" da /admin/settings, stesso evento).
      // Svuota anche lo storico: se restasse, la rotazione rimetterebbe a
      // schermo esattamente cio' che si voleva togliere. Il cursore e la
      // memoria dei visti sopravvivono, cosi' il primo poll successivo non fa
      // rientrare tutta la serata.
      //
      // I contatori invece si azzerano: rappresentano quanto c'e' di valido
      // ORA (coerente col fix dello stesso numero su "remove"), e dopo un
      // clear non c'e' piu' niente, per definizione.
      return {
        ...state,
        phase: "idle",
        current: null,
        isReplay: false,
        queue: [],
        all: [],
        showCounts: new Map(),
        lastShownId: null,
        phaseEndsAt: 0,
        stats: { received: 0, displayed: 0, dropped: 0 },
      };

    case "ended":
      // Rispecchia il valore del server, in entrambe le direzioni: non
      // ricrea l'oggetto stato se non cambia nulla (evita render inutili a
      // ogni poll), ma se il moderatore riapre la serata questo e' il modo
      // in cui il display lo scopre da solo.
      return state.ended === action.value ? state : { ...state, ended: action.value };

    case "closingPhrase":
      return state.closingPhrase === action.value
        ? state
        : { ...state, closingPhrase: action.value };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
