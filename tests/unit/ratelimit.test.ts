import { describe, expect, it } from "vitest";

/**
 * Semantica di `max: 0`.
 *
 * Il valore piu' probabile che qualcuno scriva in `.env` volendo dire "questo
 * limite non lo voglio" e' zero. Con il confronto ingenuo (`count >= 0`)
 * significherebbe l'opposto — blocca sempre — e la serata finirebbe al primo
 * messaggio. Questo test esiste per rendere impossibile quella regressione.
 *
 * Le soglie si leggono a import time da `process.env`, quindi vanno impostate
 * prima: il file gira isolato dagli altri.
 */
process.env.RATE_LIMIT_ENABLED = "true";
process.env.RL_SESSION_MAX = "1";
process.env.RL_IP_MAX = "0";
process.env.RL_GLOBAL_MAX = "0";

const { checkRateLimit } = await import("@/lib/ratelimit");
const { serverConfig } = await import("@/lib/config");

import type { RateLimitQuery, Repository } from "@/lib/db/types";

/** Repo finto: interessa solo quali conteggi vengono davvero richiesti. */
function fakeRepo(count: number) {
  const queries: RateLimitQuery[] = [];
  const repo = {
    async countRecent(query: RateLimitQuery) {
      queries.push(query);
      return count;
    },
  } as unknown as Repository;
  return { repo, queries };
}

const args = { eventId: "e1", ipHash: "hash", sessionId: "s1" };

describe("checkRateLimit con un ambito a 0", () => {
  it("legge 0 come 'ambito spento', non come 'blocca tutto'", () => {
    expect(serverConfig.rateLimit.ip.max).toBe(0);
    expect(serverConfig.rateLimit.global.max).toBe(0);
  });

  it("lascia passare anche con conteggi altissimi sugli ambiti spenti", async () => {
    const { repo } = fakeRepo(10_000);
    const verdict = await checkRateLimit(repo, args);

    // La sessione e' l'unico ambito attivo, e con 10.000 messaggi recenti
    // deve essere lei a fermare — non ip, non global.
    expect(verdict.allowed).toBe(false);
    expect(verdict.scope).toBe("session");
  });

  it("non interroga il database per gli ambiti spenti", async () => {
    const { repo, queries } = fakeRepo(0);
    const verdict = await checkRateLimit(repo, args);

    expect(verdict.allowed).toBe(true);
    // Solo la sessione: due round trip risparmiati su ogni invio.
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sessionId).toBe("s1");
  });
});
