/**
 * Prova di carico: lo scenario dichiarato, 50 messaggi in pochi secondi.
 *
 * Non e' un test automatico e non gira in CI. Si lancia con il `/display`
 * aperto su un secondo schermo e SI GUARDA: nessuna asserzione sostituisce il
 * vedere se la coda si smaltisce, se l'ordine tiene e se qualcosa sfarfalla.
 *
 *   npm run dev
 *   npm run burst -- --count 50 --window 5
 */

import { randomUUID } from "node:crypto";

interface Options {
  baseUrl: string;
  count: number;
  windowSeconds: number;
  eventSlug: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const read = (flag: string, fallback: string): string => {
    const index = args.indexOf(`--${flag}`);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };

  return {
    baseUrl: read("url", "http://localhost:3000").replace(/\/$/, ""),
    count: Number(read("count", "50")),
    windowSeconds: Number(read("window", "5")),
    eventSlug: read("event", "default"),
  };
}

const BODIES = [
  "Grazie per questa serata incredibile!",
  "Auguri amore mio, sei tutto per me",
  "Siete i migliori, tornate presto",
  "Dedico questa canzone a mio nonno",
  "Il mio primo concerto, non lo dimentico piu'",
  "Da Brescia con tutto il cuore",
  "Suonate ancora quella del primo disco!",
  "Mia figlia canta le vostre canzoni da quando ha tre anni",
  "Che spettacolo, mi sono commosso",
  "Vi seguo da dieci anni e non mi stanco mai",
  "Buon compleanno Giulia! Te lo dedico da qui",
  "Grazie per la musica che ci tiene insieme",
];

const NAMES = [null, "Marco", "Anna", "Giulia", "Luca", null, "Sara", "Il Fede", null];

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

async function main(): Promise<void> {
  const options = parseArgs();
  const spacingMs = (options.windowSeconds * 1000) / options.count;

  console.log(
    `Invio ${options.count} messaggi in ~${options.windowSeconds}s verso ${options.baseUrl}`,
  );
  console.log("Apri /display su un altro schermo e guarda cosa succede.\n");

  const outcomes = new Map<number, number>();
  const started = Date.now();

  const requests = Array.from({ length: options.count }, async (_unused, index) => {
    // Ogni "persona" ha la sua sessione: senza questo il rate limit per
    // sessione bloccherebbe tutto dopo il primo messaggio, ed e' giusto cosi'.
    await new Promise((resolve) => setTimeout(resolve, index * spacingMs));

    try {
      const response = await fetch(`${options.baseUrl}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventSlug: options.eventSlug,
          body: `${pick(BODIES)} (#${index + 1})`,
          name: pick(NAMES),
          clientMsgId: randomUUID(),
          sessionId: randomUUID(),
          elapsedMs: 4000 + Math.floor(Math.random() * 8000),
        }),
      });
      outcomes.set(response.status, (outcomes.get(response.status) ?? 0) + 1);
    } catch (error) {
      console.error(`  #${index + 1} fallito:`, error instanceof Error ? error.message : error);
      outcomes.set(0, (outcomes.get(0) ?? 0) + 1);
    }
  });

  await Promise.all(requests);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nCompletato in ${elapsed}s`);
  for (const [status, count] of [...outcomes].sort((a, b) => a[0] - b[0])) {
    const label = status === 0 ? "errore di rete" : `HTTP ${status}`;
    console.log(`  ${label}: ${count}`);
  }

  const rateLimited = outcomes.get(429) ?? 0;
  if (rateLimited > 0) {
    console.log(
      `\n  ${rateLimited} respinti dal rate limit globale — atteso oltre ` +
        "la soglia, e' il circuit breaker che fa il suo lavoro.",
    );
  }

  console.log("\nOra guarda il display: la coda deve smaltirsi in ordine e senza doppioni.");
}

void main();
