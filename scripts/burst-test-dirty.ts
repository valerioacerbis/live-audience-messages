/**
 * Prova di carico mirata ai tre livelli di filtro (clean / suspect / blocked),
 * non solo al volume grezzo come `burst-test.ts`.
 *
 * La risposta HTTP e' sempre {ok:true, status:"received"} per design (vedi
 * `accepted()` in src/lib/service/messages.ts): chi invia non deve mai sapere
 * se e' finito in coda, rifiutato o gia' approvato. Questo script quindi non
 * puo' verificare l'esito da solo — serve aprire `/admin` (coda pending) e
 * `/display` e confrontare con il riepilogo stampato alla fine.
 *
 *   npm run dev
 *   npm run burst:dirty -- --url https://...
 */

import { randomUUID } from "node:crypto";

interface Options {
  baseUrl: string;
  windowSeconds: number;
  eventSlug: string;
  count: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const read = (flag: string, fallback: string): string => {
    const index = args.indexOf(`--${flag}`);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };

  return {
    baseUrl: read("url", "http://localhost:3000").replace(/\/$/, ""),
    windowSeconds: Number(read("window", "10")),
    eventSlug: read("event", "default"),
    count: Number(read("count", "0")), // 0 = una sola passata sui casi sotto
  };
}

type Category = "clean" | "suspect" | "blocked";

interface Case {
  category: Category;
  reason: string;
  body: string;
  name?: string;
}

// Frasi riprese da tests/unit/moderation.test.ts: gia' verificate contro il
// filtro reale, non improvvisate qui.
const CASES: readonly Case[] = [
  { category: "clean", reason: "dedica normale", body: "Grazie per questa serata incredibile!" },
  { category: "clean", reason: "dedica normale", body: "Siete i migliori, tornate presto a Brescia" },
  { category: "clean", reason: "coro legittimo, non spam", body: "Forza ragazzi siete grandi davvero" },
  { category: "clean", reason: "Scunthorpe problem", body: "Analisi perfetta del pezzo nuovo" },

  { category: "suspect", reason: "volgarita' leggera", body: "che cazzo di concerto ragazzi" },
  { category: "suspect", reason: "link", body: "seguitemi su miosito.com" },
  { category: "suspect", reason: "numero di telefono", body: "chiamami 333 1234567" },
  { category: "suspect", reason: "invito su altra piattaforma", body: "scrivimi su whatsapp" },
  { category: "suspect", reason: "email", body: "scrivimi a tizio@example.com" },
  { category: "suspect", reason: "testo ripetitivo", body: "forza forza forza forza forza forza forza" },
  { category: "suspect", reason: "letter flooding", body: "caaaaazzzzooooo che serata" },

  { category: "blocked", reason: "slur", body: "sei un frocio" },
  { category: "blocked", reason: "minaccia diretta", body: "ti ammazzo" },
  { category: "blocked", reason: "minaccia diretta", body: "vi ammazzo tutti" },
  { category: "blocked", reason: "minaccia diretta", body: "ti spacco la faccia" },
  { category: "blocked", reason: "leetspeak", body: "sei un fr0c10" },
  { category: "blocked", reason: "slur nel nome, corpo pulito", body: "Bella serata!", name: "troia" },
];

async function main(): Promise<void> {
  const options = parseArgs();
  const total = options.count > 0 ? options.count : CASES.length;
  // Sopra a CASES.length si ricicla la lista: le frasi si ripetono, ma con
  // clientMsgId/sessionId sempre nuovi restano messaggi distinti per il server.
  const queue = Array.from({ length: total }, (_unused, index) => CASES[index % CASES.length]!);
  const spacingMs = (options.windowSeconds * 1000) / total;

  console.log(
    `Invio ${total} messaggi (mix clean/suspect/blocked) in ~${options.windowSeconds}s verso ${options.baseUrl}`,
  );
  console.log("Tieni /admin aperto (operatore presente) e /display su un secondo schermo.\n");

  const outcomes = new Map<number, number>();
  const started = Date.now();

  const requests = queue.map(async (testCase, index) => {
    await new Promise((resolve) => setTimeout(resolve, index * spacingMs));

    try {
      const response = await fetch(`${options.baseUrl}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventSlug: options.eventSlug,
          body: testCase.body,
          name: testCase.name ?? null,
          clientMsgId: randomUUID(),
          sessionId: randomUUID(),
          elapsedMs: 4000 + Math.floor(Math.random() * 8000),
        }),
      });
      outcomes.set(response.status, (outcomes.get(response.status) ?? 0) + 1);
    } catch (error) {
      console.error(`  [${testCase.category}] fallito:`, error instanceof Error ? error.message : error);
      outcomes.set(0, (outcomes.get(0) ?? 0) + 1);
    }
  });

  await Promise.all(requests);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Completato in ${elapsed}s`);
  for (const [status, count] of [...outcomes].sort((a, b) => a[0] - b[0])) {
    const label = status === 0 ? "errore di rete" : `HTTP ${status}`;
    console.log(`  ${label}: ${count}`);
  }

  console.log(
    "\nLa risposta HTTP e' sempre 200 'received' anche per i messaggi bloccati (per design, " +
      "vedi il commento in cima allo script) — l'unico modo per verificare l'esito e' guardare " +
      "/admin e /display. Checklist:\n",
  );

  const repeats = Math.floor(total / CASES.length);
  const remainder = total % CASES.length;
  for (const category of ["clean", "suspect", "blocked"] as const) {
    const cases = CASES.filter((c) => c.category === category);
    const sentCount = queue.filter((c) => c.category === category).length;
    console.log(`${category.toUpperCase()} (${sentCount} inviati, ${cases.length} frasi distinte):`);
    for (const c of cases) {
      const who = c.name ? ` [nome: "${c.name}"]` : "";
      console.log(`  - "${c.body}"${who}  — ${c.reason}`);
    }
    console.log("");
  }
  if (repeats > 1 || remainder > 0) {
    console.log(
      `(la lista di ${CASES.length} frasi e' stata ripetuta ${repeats} volte` +
        (remainder > 0 ? ` + ${remainder} in piu'` : "") +
        " per arrivare al totale richiesto)\n",
    );
  }

  console.log(
    "Atteso: i CLEAN passano (in coda pending se /admin e' aperto, altrimenti auto-rilasciati);\n" +
      "i SUSPECT finiscono in coda pending con il motivo giusto accanto (mai auto-rilasciati);\n" +
      "i BLOCKED non compaiono MAI ne' in coda ne' su schermo, in nessun momento.",
  );
}

void main();
