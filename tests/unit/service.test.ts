import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";

process.env.MEMORY_DB_FILE = ".data/test-messages.json";

const { getRepository } = await import("@/lib/db");
const { createMessage, getFeed, resolveEvent } = await import("@/lib/service/messages");
const { addSyntheticMessages, getAdminSnapshot, setClosingPhrase, setModerationMode } =
  await import("@/lib/service/admin");
const { __resetMemoryRepository } = await import("@/lib/db/memory");
const { serverConfig } = await import("@/lib/config");
const { SYNTHETIC_PHRASES } = await import("@/lib/domain/syntheticPhrases");

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

/** Stringa lunga `n` senza corse di caratteri ripetuti (vedi `CHAR_FLOOD` in sanitize.ts). */
function variedText(n: number): string {
  return Array.from({ length: n }, (_, i) => (i % 10).toString()).join("");
}

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
    expect(String(result.body.message)).toMatch(/80 caratteri/);
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

describe("addSyntheticMessages", () => {
  it("in manuale restano in coda con l'etichetta 'synthetic'", async () => {
    await resolveEvent(SLUG);
    await setModerationMode(SLUG, "manual");

    const result = await addSyntheticMessages(SLUG, 10);
    expect(result.added).toBe(10);

    const event = await resolveEvent(SLUG);
    const pending = await getRepository().listByStatus(event.id, "pending", 100);
    expect(pending).toHaveLength(10);
    expect(pending.every((m) => m.source === "synthetic")).toBe(true);
    expect(pending.every((m) => m.filterVerdict === "clean")).toBe(true);

    // Non toccano il display finche' nessuno le approva.
    const feed = await getFeed({ eventSlug: SLUG, since: null, limit: 100 });
    expect(feed.messages).toHaveLength(0);
  });

  it("in automatica saltano dritte a schermo, come un messaggio reale 'clean'", async () => {
    await resolveEvent(SLUG);
    await setModerationMode(SLUG, "auto");

    const result = await addSyntheticMessages(SLUG, 10);
    expect(result.added).toBe(10);

    const event = await resolveEvent(SLUG);
    const approved = await getRepository().listByStatus(event.id, "approved", 100);
    expect(approved).toHaveLength(10);
    expect(approved.every((m) => m.source === "synthetic")).toBe(true);
  });

  it("due lotti di fila non ripetono una frase finche' il pool lo consente", async () => {
    await resolveEvent(SLUG);
    await setModerationMode(SLUG, "manual");

    await addSyntheticMessages(SLUG, 10);
    await addSyntheticMessages(SLUG, 10);

    const event = await resolveEvent(SLUG);
    const pending = await getRepository().listByStatus(event.id, "pending", 100);
    const bodies = pending.map((m) => m.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it("un messaggio vero passa sempre prima delle autogenerate, anche se arrivato dopo", async () => {
    await resolveEvent(SLUG);
    await setModerationMode(SLUG, "manual");

    // Le sintetiche sono gia' in coda da prima...
    await addSyntheticMessages(SLUG, 5);
    // ...poi arriva un messaggio reale.
    await createMessage(payload({ body: "Questa e' una dedica vera" }), ctx);

    const event = await resolveEvent(SLUG);
    const pending = await getRepository().listByStatus(event.id, "pending", 100);

    expect(pending[0]!.source).toBe("user");
    expect(pending.slice(1).every((m) => m.source === "synthetic")).toBe(true);
  });

  it("una volta esaurito il pool non aggiunge piu' nulla, mai una ripetizione", async () => {
    await resolveEvent(SLUG);
    await setModerationMode(SLUG, "manual");

    const total = SYNTHETIC_PHRASES.length;
    let addedSoFar = 0;
    while (addedSoFar < total) {
      const batch = Math.min(10, total - addedSoFar);
      const result = await addSyntheticMessages(SLUG, 10);
      expect(result.added).toBe(batch);
      addedSoFar += result.added;
    }

    const exhausted = await addSyntheticMessages(SLUG, 10);
    expect(exhausted.added).toBe(0);
    expect(exhausted.available).toBe(0);

    const event = await resolveEvent(SLUG);
    const pending = await getRepository().listByStatus(event.id, "pending", 200);
    const bodies = pending.map((m) => m.body);
    expect(pending).toHaveLength(total);
    expect(new Set(bodies).size).toBe(total);
  });

  it("getAdminSnapshot espone quante frasi pronte restano disponibili", async () => {
    await resolveEvent(SLUG);
    await setModerationMode(SLUG, "manual");

    const before = await getAdminSnapshot(SLUG);
    expect(before.syntheticAvailable).toBe(SYNTHETIC_PHRASES.length);

    await addSyntheticMessages(SLUG, 10);

    const after = await getAdminSnapshot(SLUG);
    expect(after.syntheticAvailable).toBe(SYNTHETIC_PHRASES.length - 10);
  });
});

describe("setClosingPhrase", () => {
  it("senza override, getAdminSnapshot risolve al default applicativo", async () => {
    await resolveEvent(SLUG);
    const snapshot = await getAdminSnapshot(SLUG);
    expect(snapshot.event.closingPhrase).toBe(serverConfig.event.closingPhrase);
  });

  it("una frase entro il limite viene salvata e risolta ovunque", async () => {
    await resolveEvent(SLUG);
    const result = await setClosingPhrase(SLUG, "Grazie e buonanotte");
    expect(result).toEqual({ ok: true });

    expect((await getAdminSnapshot(SLUG)).event.closingPhrase).toBe("Grazie e buonanotte");
    expect((await getFeed({ eventSlug: SLUG, since: null, limit: 10 })).closingPhrase).toBe(
      "Grazie e buonanotte",
    );
  });

  it("una frase oltre il limite viene rifiutata e non tocca quella salvata prima", async () => {
    await resolveEvent(SLUG);
    await setClosingPhrase(SLUG, "Frase valida");

    // Non un carattere ripetuto: `sanitizeText` collassa 5+ ripetizioni di
    // fila (protezione anti-flood), il che accorcerebbe la stringa e
    // vanificherebbe il test.
    const tooLong = variedText(serverConfig.limits.closingPhraseMaxLength + 1);
    const result = await setClosingPhrase(SLUG, tooLong);
    expect(result).toEqual({ ok: false, error: "too_long" });

    // Rifiutata: la frase precedente resta quella a schermo, non quella nuova.
    expect((await getAdminSnapshot(SLUG)).event.closingPhrase).toBe("Frase valida");
  });

  it("una frase esattamente al limite viene accettata", async () => {
    await resolveEvent(SLUG);
    const atLimit = variedText(serverConfig.limits.closingPhraseMaxLength);
    const result = await setClosingPhrase(SLUG, atLimit);
    expect(result).toEqual({ ok: true });
    expect((await getAdminSnapshot(SLUG)).event.closingPhrase).toBe(atLimit);
  });

  it("una frase vuota o di soli spazi riporta al default applicativo", async () => {
    await resolveEvent(SLUG);
    await setClosingPhrase(SLUG, "Prima la imposto");
    expect((await getAdminSnapshot(SLUG)).event.closingPhrase).toBe("Prima la imposto");

    const result = await setClosingPhrase(SLUG, "   ");
    expect(result).toEqual({ ok: true });
    expect((await getAdminSnapshot(SLUG)).event.closingPhrase).toBe(
      serverConfig.event.closingPhrase,
    );
  });
});
