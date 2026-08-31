import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

import { serverConfig } from "../config";
import { shouldAutoRelease } from "../domain/policy";
import type { EventRecord, MessageRecord, MessageStatus } from "../domain/types";
import type { NewMessage, RateLimitQuery, Repository } from "./types";

/**
 * Driver di sviluppo: tutto in memoria, persistito su un file JSON.
 *
 * Serve a far girare l'applicazione completa senza alcun account e senza
 * Docker. Non e' pensato per la produzione su serverless — ogni istanza di
 * funzione avrebbe la propria copia — e infatti `index.ts` lo rifiuta la'.
 * Su una macchina singola invece funziona benissimo, ed e' la base del piano
 * di riserva offline se al locale non ci fosse rete.
 */

interface Snapshot {
  events: EventRecord[];
  messages: MessageRecord[];
}

const EMPTY: Snapshot = { events: [], messages: [] };

let snapshot: Snapshot | null = null;
/** Le scritture sono serializzate: niente race sul file. */
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Snapshot> {
  if (snapshot) return snapshot;
  try {
    const raw = await readFile(serverConfig.db.memoryFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    snapshot = { events: parsed.events ?? [], messages: parsed.messages ?? [] };
  } catch {
    snapshot = { ...EMPTY };
  }
  return snapshot;
}

function persist(): Promise<void> {
  writeChain = writeChain.then(async () => {
    if (!snapshot) return;
    const path = serverConfig.db.memoryFile;
    await mkdir(dirname(path), { recursive: true });
    // Scrittura atomica: un crash a meta' non lascia un JSON troncato.
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(snapshot, null, 2), "utf8");
    await rename(tmp, path);
  });
  return writeChain;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createMemoryRepository(): Repository {
  return {
    async getEvent(slug) {
      const db = await load();
      return clone(db.events.find((e) => e.slug === slug) ?? null);
    },

    async ensureEvent(slug, name, mode) {
      const db = await load();
      const existing = db.events.find((e) => e.slug === slug);
      if (existing) return clone(existing);

      const event: EventRecord = {
        id: randomUUID(),
        slug,
        name,
        status: "live",
        moderationMode: mode,
        operatorLastSeenAt: null,
        clearedAt: null,
        createdAt: new Date().toISOString(),
        endedAt: null,
      };
      db.events.push(event);
      await persist();
      return clone(event);
    },

    async setModerationMode(eventId, mode) {
      const db = await load();
      const event = db.events.find((e) => e.id === eventId);
      if (event) {
        event.moderationMode = mode;
        await persist();
      }
    },

    async clearDisplay(eventId, at) {
      const db = await load();
      const event = db.events.find((e) => e.id === eventId);
      if (event) {
        event.clearedAt = at;
        await persist();
      }
    },

    async touchOperator(eventId, at) {
      const db = await load();
      const event = db.events.find((e) => e.id === eventId);
      if (event) {
        event.operatorLastSeenAt = at;
        await persist();
      }
    },

    async getOperatorLastSeen(eventId) {
      const db = await load();
      return db.events.find((e) => e.id === eventId)?.operatorLastSeenAt ?? null;
    },

    async insertMessage(input: NewMessage) {
      const db = await load();
      const existing = db.messages.find(
        (m) => m.eventId === input.eventId && m.clientMsgId === input.clientMsgId,
      );
      if (existing) return { message: clone(existing), created: false };

      const message: MessageRecord = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        moderatedAt: input.moderatedBy ? new Date().toISOString() : null,
        displayedAt: null,
        ...input,
      };
      db.messages.push(message);
      await persist();
      return { message: clone(message), created: true };
    },

    async findByClientMsgId(eventId, clientMsgId) {
      const db = await load();
      const found = db.messages.find(
        (m) => m.eventId === eventId && m.clientMsgId === clientMsgId,
      );
      return found ? clone(found) : null;
    },

    async listReleased({ eventId, since, limit, now }) {
      const db = await load();
      const event = db.events.find((e) => e.id === eventId);
      const floor = [since, event?.clearedAt]
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1);

      const visible = db.messages
        .filter((m) => m.eventId === eventId && m.status === "approved" && m.releasedAt)
        .filter((m) => m.releasedAt! <= now)
        .filter((m) => (floor ? m.releasedAt! > floor : true))
        .sort((a, b) =>
          a.releasedAt === b.releasedAt
            ? a.id.localeCompare(b.id)
            : a.releasedAt!.localeCompare(b.releasedAt!),
        );

      // Senza cursore siamo a un caricamento iniziale: interessa la coda
      // recente, non il replay di tutta la serata.
      const page = since ? visible.slice(0, limit) : visible.slice(-limit);
      return clone(page);
    },

    async listByStatus(eventId, status: MessageStatus, limit) {
      const db = await load();
      const rows = db.messages
        .filter((m) => m.eventId === eventId && m.status === status)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit);
      return clone(rows);
    },

    async moderate({ id, action, by, at, releasedAt }) {
      const db = await load();
      const message = db.messages.find((m) => m.id === id);
      if (!message) return null;

      if (action === "approve") {
        message.status = "approved";
        message.releasedAt = releasedAt;
        message.rejectReason = null;
      } else {
        message.status = "rejected";
        message.releasedAt = null;
        message.rejectReason = action === "remove" ? "removed" : "operator";
      }
      message.moderatedAt = at;
      message.moderatedBy = by;
      await persist();
      return clone(message);
    },

    async markDisplayed(ids, at) {
      if (ids.length === 0) return;
      const db = await load();
      const wanted = new Set(ids);
      let touched = false;
      for (const message of db.messages) {
        if (wanted.has(message.id) && !message.displayedAt) {
          message.displayedAt = at;
          touched = true;
        }
      }
      if (touched) await persist();
    },

    async countRecent(query: RateLimitQuery) {
      const db = await load();
      return db.messages.filter((m) => {
        if (m.eventId !== query.eventId) return false;
        if (m.createdAt < query.sinceIso) return false;
        if (query.ipHash && m.ipHash !== query.ipHash) return false;
        if (query.sessionId && m.sessionId !== query.sessionId) return false;
        return true;
      }).length;
    },

    async releaseAbandoned({ eventId, mode, operatorPresent, now }) {
      const db = await load();
      const released: MessageRecord[] = [];
      const at = new Date(now).toISOString();

      for (const message of db.messages) {
        if (message.eventId !== eventId) continue;
        if (!shouldAutoRelease(message, mode, operatorPresent, now)) continue;

        message.status = "approved";
        message.moderatedAt = at;
        message.moderatedBy = "auto";
        // Rilascio immediato: il ritardo di sicurezza serve a dare tempo a un
        // umano, e qui abbiamo appena stabilito che non c'e' nessuno.
        message.releasedAt = at;
        released.push(clone(message));
      }

      if (released.length > 0) await persist();
      return released;
    },

    async stats(eventId) {
      const db = await load();
      const rows = db.messages.filter((m) => m.eventId === eventId);
      return {
        total: rows.length,
        approved: rows.filter((m) => m.status === "approved").length,
        pending: rows.filter((m) => m.status === "pending").length,
        rejected: rows.filter((m) => m.status === "rejected").length,
      };
    },

    async deleteAllMessages(eventId) {
      const db = await load();
      const before = db.messages.length;
      db.messages = db.messages.filter((m) => m.eventId !== eventId);
      await persist();
      return before - db.messages.length;
    },
  };
}

/** Solo per i test: azzera lo stato in memoria. */
export function __resetMemoryRepository(): void {
  snapshot = { ...EMPTY, events: [], messages: [] };
}
