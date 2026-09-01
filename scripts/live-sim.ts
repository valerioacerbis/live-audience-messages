/**
 * Simulazione della serata vera.
 *
 * `burst-test.ts` spara N richieste a raffica: serve a guardare il display
 * mentre la coda si smaltisce, non a dire se le soglie reggono. Questo script
 * modella invece il comportamento del pubblico, che e' l'unica cosa che
 * decide se qualcuno leggera' "riprova piu' tardi" la sera del concerto:
 *
 * - ogni spettatore ha la SUA sessione, che resta la stessa tra un messaggio
 *   e l'altro — come il `localStorage` del suo telefono. E' la differenza che
 *   fa scattare (o no) il limite per sessione;
 * - gli arrivi non sono uniformi: quando il QR compare sul maxischermo la
 *   maggior parte delle persone reagisce nei primi secondi, poi c'e' una
 *   coda lunga. La distribuzione e' pesata verso l'inizio apposta;
 * - una parte scrive un secondo messaggio piu' tardi, e una piccola quota e'
 *   impaziente e riprova subito: quelli DEVONO incontrare il limite di
 *   sessione, ed e' il segno che la protezione anti-monopolio funziona.
 *
 * Tutte le richieste partono da un solo IP, quindi lo script e' anche la
 * verifica diretta che il tetto per IP non scatti alla scala vera.
 *
 *   npm run sim -- --url https://<dominio> --spectators 350 --window 120
 *
 * Guarda comunque il display mentre gira: i numeri dicono se il servizio
 * regge, non se lo spettacolo funziona.
 */

import { randomUUID } from "node:crypto";

import { RATE_LIMIT_MESSAGES } from "../src/lib/ratelimit";

interface Options {
  baseUrl: string;
  spectators: number;
  windowSeconds: number;
  eventSlug: string;
  /** Quota che scrive un secondo messaggio piu' tardi nella serata. */
  secondRate: number;
  /** Quota che riprova subito, senza aspettare: deve incontrare il limite. */
  impatientRate: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const read = (flag: string, fallback: string): string => {
    const index = args.indexOf(`--${flag}`);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };

  return {
    baseUrl: read("url", "http://localhost:3000").replace(/\/$/, ""),
    spectators: Number(read("spectators", "350")),
    windowSeconds: Number(read("window", "120")),
    eventSlug: read("event", "default"),
    secondRate: Number(read("second-rate", "0.35")),
    impatientRate: Number(read("impatient-rate", "0.05")),
  };
}

const BODIES = [
  "Da oggi ascolto di piu' e giudico di meno",
  "Prometto di chiamare mia madre tutte le domeniche",
  "Voglio smettere di rimandare le cose che contano",
  "Da domani porto a spasso il cane del vicino anziano",
  "Mi impegno a dire grazie piu' spesso",
  "Voglio imparare a chiedere scusa per primo",
  "Da oggi do una mano a chi ne ha bisogno, senza aspettare che me lo chieda",
  "Prometto di essere piu' paziente con mio figlio",
  "Voglio ricominciare a donare il sangue",
  "Mi prendo cura di me, cosi' posso prendermi cura degli altri",
  "Da stasera spengo il telefono a cena",
  "Voglio insegnare a qualcuno quello che so fare",
  "Prometto di non voltarmi dall'altra parte",
  "Da oggi ricomincio a leggere, e a farlo insieme a mia figlia",
  "Mi impegno a fare la differenziata sul serio",
];

const NAMES = [null, "Marco", "Anna", "Giulia", "Luca", null, "Sara", "Il Fede", null, "Chiara"];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const between = (min: number, max: number): number => min + Math.random() * (max - min);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Scope = "session" | "ip" | "global";

const SCOPE_BY_MESSAGE = new Map<string, Scope>(
  (Object.entries(RATE_LIMIT_MESSAGES) as [Scope, string][]).map(([scope, text]) => [text, scope]),
);

interface Outcome {
  status: number;
  scope: Scope | null;
  latencyMs: number;
  /** Millisecondi dall'inizio della simulazione: serve per il picco al minuto. */
  atMs: number;
}

/** Uno spettatore: la sessione resta la stessa per tutta la serata. */
interface Spectator {
  sessionId: string;
  name: string | null;
}

const outcomes: Outcome[] = [];

async function send(
  options: Options,
  spectator: Spectator,
  startedAt: number,
): Promise<void> {
  const t0 = Date.now();
  try {
    const response = await fetch(`${options.baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventSlug: options.eventSlug,
        body: pick(BODIES),
        name: spectator.name,
        // Nuovo per ogni messaggio: e' un messaggio diverso, non un rinvio.
        clientMsgId: randomUUID(),
        sessionId: spectator.sessionId,
        elapsedMs: Math.round(between(4000, 20_000)),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    let scope: Scope | null = null;
    if (response.status === 429) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      scope = SCOPE_BY_MESSAGE.get(data.message ?? "") ?? null;
    }

    outcomes.push({
      status: response.status,
      scope,
      latencyMs: Date.now() - t0,
      atMs: t0 - startedAt,
    });
  } catch {
    outcomes.push({ status: 0, scope: null, latencyMs: Date.now() - t0, atMs: t0 - startedAt });
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index]!;
}

/** Massimo numero di messaggi in una qualunque finestra di 60 secondi. */
function peakPerMinute(timestampsMs: number[]): number {
  if (timestampsMs.length === 0) return 0;
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  let peak = 0;
  let left = 0;
  for (let right = 0; right < sorted.length; right += 1) {
    while (sorted[right]! - sorted[left]! >= 60_000) left += 1;
    peak = Math.max(peak, right - left + 1);
  }
  return peak;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const startedAt = Date.now();

  console.log(
    `Simulazione: ${options.spectators} spettatori, picco degli arrivi su ` +
      `${options.windowSeconds}s, verso ${options.baseUrl}`,
  );
  console.log(`Evento "${options.eventSlug}". Tieni aperto /display e guardalo.\n`);

  const plans: Promise<void>[] = [];
  let scheduled = 0;
  let lastArrivalMs = 0;

  for (let i = 0; i < options.spectators; i += 1) {
    const spectator: Spectator = { sessionId: randomUUID(), name: pick(NAMES) };

    // Arrivi pesati verso l'inizio: quando il QR compare, la maggior parte
    // delle persone reagisce subito e il resto si distribuisce sulla coda.
    const arrivalMs = options.windowSeconds * 1000 * Math.random() ** 2;
    lastArrivalMs = Math.max(lastArrivalMs, arrivalMs);
    scheduled += 1;

    plans.push(
      (async () => {
        await sleep(arrivalMs);
        await send(options, spectator, startedAt);
      })(),
    );

    const roll = Math.random();
    if (roll < options.impatientRate) {
      // Impaziente: riprova entro pochi secondi. Deve incontrare il limite di
      // sessione, ed e' esattamente il caso per cui quel limite esiste.
      const retryMs = arrivalMs + between(5000, 25_000);
      lastArrivalMs = Math.max(lastArrivalMs, retryMs);
      scheduled += 1;
      plans.push(
        (async () => {
          await sleep(retryMs);
          await send(options, spectator, startedAt);
        })(),
      );
    } else if (roll < options.impatientRate + options.secondRate) {
      // Secondo messaggio piu' avanti nella serata: intervallo umano, ben
      // oltre la finestra del limite di sessione.
      const laterMs = arrivalMs + between(40_000, 120_000);
      lastArrivalMs = Math.max(lastArrivalMs, laterMs);
      scheduled += 1;
      plans.push(
        (async () => {
          await sleep(laterMs);
          await send(options, spectator, startedAt);
        })(),
      );
    }
  }

  console.log(
    `${scheduled} messaggi programmati, ultimo a ~${Math.round(lastArrivalMs / 1000)}s. ` +
      "Attendi la fine.\n",
  );

  const progress = setInterval(() => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const ok = outcomes.filter((o) => o.status === 200).length;
    console.log(`  ${elapsed}s — inviati ${outcomes.length}/${scheduled}, accettati ${ok}`);
  }, 10_000);

  await Promise.all(plans);
  clearInterval(progress);

  /* --- riepilogo --- */

  const accepted = outcomes.filter((o) => o.status === 200);
  const byScope = (scope: Scope) => outcomes.filter((o) => o.scope === scope).length;
  const networkErrors = outcomes.filter((o) => o.status === 0).length;
  const serverErrors = outcomes.filter((o) => o.status >= 500).length;
  const unknown429 = outcomes.filter((o) => o.status === 429 && o.scope === null).length;

  const latencies = [...accepted.map((o) => o.latencyMs)].sort((a, b) => a - b);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Durata reale: ${elapsed}s · ${outcomes.length} messaggi inviati\n`);

  console.log(`  accettati (200)          ${accepted.length}`);
  console.log(`  429 limite di sessione   ${byScope("session")}   <- atteso: gli impazienti`);
  console.log(`  429 limite per IP        ${byScope("ip")}   <- deve essere 0`);
  console.log(`  429 circuit breaker      ${byScope("global")}   <- deve essere 0`);
  if (unknown429 > 0) console.log(`  429 non classificati     ${unknown429}`);
  if (serverErrors > 0) console.log(`  errori server (5xx)      ${serverErrors}`);
  if (networkErrors > 0) console.log(`  errori di rete/timeout   ${networkErrors}`);

  console.log(`\n  latenza p50  ${percentile(latencies, 50)} ms`);
  console.log(`  latenza p95  ${percentile(latencies, 95)} ms`);
  console.log(`  latenza p99  ${percentile(latencies, 99)} ms`);
  console.log(`  latenza max  ${latencies.at(-1) ?? 0} ms`);

  const peakAttempts = peakPerMinute(outcomes.map((o) => o.atMs));
  const peakAccepted = peakPerMinute(accepted.map((o) => o.atMs));
  console.log(`\n  picco tentativi in 60s   ${peakAttempts}`);
  console.log(`  picco accettati in 60s   ${peakAccepted}   (confronta con RL_GLOBAL_MAX)`);

  /* --- verdetto --- */

  const problems: string[] = [];
  if (byScope("ip") > 0) {
    problems.push(
      `${byScope("ip")} messaggi respinti dal tetto per IP. Alza RL_IP_MAX, oppure ` +
        "mettilo a 0 per spegnere l'ambito.",
    );
  }
  if (byScope("global") > 0) {
    problems.push(
      `${byScope("global")} messaggi respinti dal circuit breaker. Il picco accettato ` +
        `in un minuto e' stato ${peakAccepted}: alza RL_GLOBAL_MAX sopra quel numero.`,
    );
  }
  if (networkErrors > 0 || serverErrors > 0) {
    problems.push(
      `${networkErrors + serverErrors} richieste non hanno ricevuto una risposta valida. ` +
        "Guarda i log della funzione su Vercel prima di concludere qualcosa.",
    );
  }
  if (percentile(latencies, 95) > 3000) {
    problems.push(
      `p95 a ${percentile(latencies, 95)} ms: dal telefono si sente. Verifica che la ` +
        "regione della funzione e quella del database siano entrambe fra1.",
    );
  }

  console.log(`\n${"─".repeat(60)}`);
  if (problems.length === 0) {
    console.log("OK — nessun rifiuto oltre a quelli attesi, nessun errore.");
    console.log("I 429 di sessione sono il comportamento voluto: una persona sola");
    console.log("non puo' occupare lo schermo di tutti.");
  } else {
    console.log("DA SISTEMARE:");
    for (const problem of problems) console.log(`  - ${problem}`);
  }

  console.log(
    `\nQuesti messaggi sono ora nell'evento "${options.eventSlug}": svuotalo con ` +
      "\"Reset messaggi\" in /admin/settings prima della serata vera.",
  );
}

void main();
