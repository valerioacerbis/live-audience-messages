import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";

process.env.MEMORY_DB_FILE = ".data/test-messages.json";

const { getRepository } = await import("@/lib/db");
const { createMessage, getFeed, resolveEvent } = await import("@/lib/service/messages");
const { __resetMemoryRepository } = await import("@/lib/db/memory");
const { serverConfig } = await import("@/lib/config");

/**
 * Test di integrazione sul service layer, con il driver `memory`.
 *
 * Copre il comportamento visto dall'esterno — cosa succede a un messaggio dal
 * momento in cui arriva — senza passare da HTTP. E' il livello a cui vivono i
 * bug che contano davvero durante un concerto.
 */

const SLUG = "test-event";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    eventSlug: SLUG,
    body: "Grazie per questa serata incredibile",
    name: null,
    clientMsgId: randomUUID(),
    sessionId: randomUUID(),
    elapsedMs: 6000,
    ...overrides,
  } as Parameters<typeof createMessage>[0];
}

const ctx = { ipHash: "hash-di-test" };

beforeEach(async () => {
  __resetMemoryRepository();
  await rm(".data/test-messages.json", { force: true });
});

describe("createMessage", () => {
  it("accetta un messaggio normale", async () => {
    const result = await createMessage(payload(), ctx);
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("received");
  });

  it("scarta in silenzio il honeypot, con una risposta identica a un successo", async () => {
    const result = await createMessage(payload({ hp: "spam" }), ctx);

    expect(result.status).toBe(200);
    expect(result.body.status).toBe("received");

    // Nulla e' stato salvato: al bot non diciamo che l'abbiamo riconosciuto.
    const event = await resolveEvent(SLUG);
    expect((await getRepository().stats(event.id)).total).toBe(0);
  });

  it("scarta in silenzio un invio troppo rapido per un umano", async () => {
    const result = await createMessage(payload({ elapsedMs: 200 }), ctx);
    expect(result.status).toBe(200);

    const event = await resolveEvent(SLUG);
    expect((await getRepository().stats(event.id)).total).toBe(0);
  });

  it("rifiuta un messaggio vuoto con un messaggio comprensibile", async () => {
    const result = await createMessage(payload({ body: "   " }), ctx);
    expect(result.status).toBe(400);
    expect(String(result.body.message)).toMatch(/scrivi qualcosa/i);
  });

  it("rifiuta un messaggio oltre il limite di caratteri", async () => {
    // Testo vario, non un carattere ripetuto: il sanitizer collassa i
    // flooding di caratteri, quindi "a" x 500 diventerebbe legittimamente
    // corto e non proverebbe niente.
    const lungo = "Grazie mille per questa serata meravigliosa. ".repeat(10);
    const result = await createMessage(payload({ body: lungo }), ctx);

    expect(result.status).toBe(400);
    expect(String(result.body.message)).toMatch(/120 caratteri/);
  });

  it("collassa il flooding di caratteri invece di rifiutarlo", async () => {
    const result = await createMessage(payload({ body: `GRANDI${"I".repeat(400)}` }), ctx);
    expect(result.status).toBe(200);
  });

  it("salva i contenuti bloccati senza dirlo a chi li ha scritti", async () => {
    const result = await createMessage(payload({ body: "sei un frocio" }), ctx);

    // Stessa identica risposta di un invio riuscito.
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("received");

    const event = await resolveEvent(SLUG);
    const stats = await getRepository().stats(event.id);
    expect(stats.rejected).toBe(1);
    expect(stats.approved).toBe(0);

    // E soprattutto: non arriva mai al display.
    const feed = await getFeed({ eventSlug: SLUG, since: null, limit: 100 });
    expect(feed.messages).toHaveLength(0);
  });
});

describe("idempotenza", () => {
  it("il rinvio dello stesso messaggio restituisce lo stesso id", async () => {
    const input = payload();

    const first = await createMessage(input, ctx);
    const second = await createMessage(input, ctx);

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);

    const event = await resolveEvent(SLUG);
    expect((await getRepository().stats(event.id)).total).toBe(1);
  });

  it("il rinvio passa anche quando il rate limit sarebbe scattato", async () => {
    // La regressione che conta: su una rete che perde le risposte, chi
    // ritocca INVIA deve ricevere la conferma, non "aspetta un attimo".
    // Con i controlli nell'ordine sbagliato questo test fallisce con un 429.
    const input = payload();
    await createMessage(input, ctx);

    // Con RL_SESSION_MAX=1 la sessione ha gia' esaurito la sua finestra.
    expect(serverConfig.rateLimit.session.max).toBe(1);

    const retry = await createMessage(input, ctx);
    expect(retry.status).toBe(200);
  });

  it("un messaggio diverso dalla stessa sessione viene invece limitato", async () => {
    const sessionId = randomUUID();
    await createMessage(payload({ sessionId }), ctx);
    const other = await createMessage(
      payload({ sessionId, body: "Un altro messaggio" }),
      ctx,
    );

    expect(other.status).toBe(429);
    expect(other.headers?.["Retry-After"]).toBeDefined();
  });
});

describe("feed del display", () => {
  it("non mostra nulla prima della finestra di sicurezza", async () => {
    await createMessage(payload(), ctx);

    // In modalita' non presidiata i messaggi puliti sono approvati, ma con
    // `released_at` spostato avanti: e' la finestra per fermarli.
    const immediate = await getFeed({ eventSlug: SLUG, since: null, limit: 100 });
    expect(immediate.messages).toHaveLength(0);
    expect(serverConfig.moderation.displayDelayMs).toBeGreaterThan(0);
  });

  it("restituisce il messaggio una volta scaduta la finestra", async () => {
    await createMessage(payload(), ctx);

    const event = await resolveEvent(SLUG);
    const repo = getRepository();
    const [row] = await repo.listByStatus(event.id, "approved", 10);
    expect(row).toBeDefined();

    // Simulo il tempo trascorso arretrando il rilascio.
    await repo.moderate({
      id: row!.id,
      action: "approve",
      by: "operator",
      at: new Date().toISOString(),
      releasedAt: new Date(Date.now() - 1000).toISOString(),
    });

    const feed = await getFeed({ eventSlug: SLUG, since: null, limit: 100 });
    expect(feed.messages).toHaveLength(1);
    expect(feed.cursor).not.toBeNull();
  });

  it("il cursore non restituisce due volte lo stesso messaggio", async () => {
    await createMessage(payload(), ctx);

    const event = await resolveEvent(SLUG);
    const repo = getRepository();
    const [row] = await repo.listByStatus(event.id, "approved", 10);
    await repo.moderate({
      id: row!.id,
      action: "approve",
      by: "operator",
      at: new Date().toISOString(),
      releasedAt: new Date(Date.now() - 1000).toISOString(),
    });

    const first = await getFeed({ eventSlug: SLUG, since: null, limit: 100 });
    expect(first.messages).toHaveLength(1);

    const second = await getFeed({ eventSlug: SLUG, since: first.cursor, limit: 100 });
    expect(second.messages).toHaveLength(0);
  });
});
