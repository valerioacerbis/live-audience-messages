import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverConfig } from "../config";
import type {
  EventRecord,
  MessageRecord,
  MessageStatus,
  ModerationMode,
} from "../domain/types";
import type { NewMessage, RateLimitQuery, Repository } from "./types";

/**
 * Driver Postgres via Supabase.
 *
 * Usa PostgREST su HTTP, non una connessione TCP: da una funzione serverless
 * e' la differenza tra funzionare e esaurire il pool di connessioni al primo
 * burst. Non serve nessun pooler, nessuna gestione di `end()`.
 *
 * Le due operazioni che devono essere atomiche (inserimento idempotente e
 * sweeper del dead-man switch) sono funzioni SQL: farle come leggi-e-scrivi
 * dall'applicazione produrrebbe duplicati sotto concorrenza.
 */

interface MessageRow {
  id: string;
  event_id: string;
  body: string;
  author_name: string | null;
  status: MessageStatus;
  filter_verdict: MessageRecord["filterVerdict"];
  reject_reason: MessageRecord["rejectReason"];
  created_at: string;
  released_at: string | null;
  moderated_at: string | null;
  moderated_by: string | null;
  displayed_at: string | null;
  ip_hash: string;
  session_id: string;
  client_msg_id: string;
}

interface EventRow {
  id: string;
  slug: string;
  name: string;
  status: EventRecord["status"];
  moderation_mode: ModerationMode;
  operator_last_seen_at: string | null;
  cleared_at: string | null;
  created_at: string;
  ended_at: string | null;
}

const toMessage = (r: MessageRow): MessageRecord => ({
  id: r.id,
  eventId: r.event_id,
  body: r.body,
  authorName: r.author_name,
  status: r.status,
  filterVerdict: r.filter_verdict,
  rejectReason: r.reject_reason,
  createdAt: r.created_at,
  releasedAt: r.released_at,
  moderatedAt: r.moderated_at,
  moderatedBy: r.moderated_by,
  displayedAt: r.displayed_at,
  ipHash: r.ip_hash,
  sessionId: r.session_id,
  clientMsgId: r.client_msg_id,
});

const toEvent = (r: EventRow): EventRecord => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  status: r.status,
  moderationMode: r.moderation_mode,
  operatorLastSeenAt: r.operator_last_seen_at,
  clearedAt: r.cleared_at,
  createdAt: r.created_at,
  endedAt: r.ended_at,
});

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const { url, serviceRoleKey } = serverConfig.supabase;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "DB_DRIVER=supabase richiede NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`Supabase (${context}): ${error?.message ?? "errore sconosciuto"}`);
}

export function createSupabaseRepository(): Repository {
  return {
    async getEvent(slug) {
      const { data, error } = await getClient()
        .from("events")
        .select("*")
        .eq("slug", slug)
        .maybeSingle<EventRow>();
      if (error) fail("getEvent", error);
      return data ? toEvent(data) : null;
    },

    async ensureEvent(slug, name, mode) {
      const existing = await this.getEvent(slug);
      if (existing) return existing;

      const { data, error } = await getClient()
        .from("events")
        .insert({ slug, name, moderation_mode: mode })
        .select("*")
        .single<EventRow>();
      if (error) fail("ensureEvent", error);
      return toEvent(data);
    },

    async setModerationMode(eventId, mode) {
      const { error } = await getClient()
        .from("events")
        .update({ moderation_mode: mode })
        .eq("id", eventId);
      if (error) fail("setModerationMode", error);
    },

    async clearDisplay(eventId, at) {
      const { error } = await getClient()
        .from("events")
        .update({ cleared_at: at })
        .eq("id", eventId);
      if (error) fail("clearDisplay", error);
    },

    async touchOperator(eventId, at) {
      const { error } = await getClient()
        .from("events")
        .update({ operator_last_seen_at: at })
        .eq("id", eventId);
      if (error) fail("touchOperator", error);
    },

    async getOperatorLastSeen(eventId) {
      const { data, error } = await getClient()
        .from("events")
        .select("operator_last_seen_at")
        .eq("id", eventId)
        .maybeSingle<{ operator_last_seen_at: string | null }>();
      if (error) fail("getOperatorLastSeen", error);
      return data?.operator_last_seen_at ?? null;
    },

    async insertMessage(input: NewMessage) {
      const { data, error } = await getClient().rpc("insert_message_idempotent", {
        p_event_id: input.eventId,
        p_body: input.body,
        p_author_name: input.authorName,
        p_status: input.status,
        p_filter_verdict: input.filterVerdict,
        p_reject_reason: input.rejectReason,
        p_released_at: input.releasedAt,
        p_moderated_by: input.moderatedBy,
        p_ip_hash: input.ipHash,
        p_session_id: input.sessionId,
        p_client_msg_id: input.clientMsgId,
      });
      if (error) fail("insertMessage", error);

      const row = (data as Array<{ message: MessageRow; created: boolean }>)[0];
      if (!row) fail("insertMessage", { message: "nessuna riga restituita" });
      return { message: toMessage(row.message), created: row.created };
    },

    async findByClientMsgId(eventId, clientMsgId) {
      const { data, error } = await getClient()
        .from("messages")
        .select("*")
        .eq("event_id", eventId)
        .eq("client_msg_id", clientMsgId)
        .maybeSingle<MessageRow>();
      if (error) fail("findByClientMsgId", error);
      return data ? toMessage(data) : null;
    },

    async listReleased({ eventId, since, limit, now }) {
      const event = await getClient()
        .from("events")
        .select("cleared_at")
        .eq("id", eventId)
        .maybeSingle<{ cleared_at: string | null }>();

      const floor = [since, event.data?.cleared_at]
        .filter((v): v is string => Boolean(v))
        .sort()
        .at(-1);

      let query = getClient()
        .from("messages")
        .select("*")
        .eq("event_id", eventId)
        .eq("status", "approved")
        .not("released_at", "is", null)
        // Il ritardo di sicurezza e' implementato spostando `released_at` nel
        // futuro: qui basta non restituire cio' che non e' ancora maturato.
        .lte("released_at", now);

      if (floor) query = query.gt("released_at", floor);

      // Senza cursore siamo a un caricamento iniziale: interessa la coda
      // recente, non il replay di tutta la serata.
      const { data, error } = since
        ? await query.order("released_at", { ascending: true }).order("id").limit(limit)
        : await query.order("released_at", { ascending: false }).order("id").limit(limit);
      if (error) fail("listReleased", error);

      const rows = (data as MessageRow[]).map(toMessage);
      return since ? rows : rows.reverse();
    },

    async listByStatus(eventId, status, limit) {
      const { data, error } = await getClient()
        .from("messages")
        .select("*")
        .eq("event_id", eventId)
        .eq("status", status)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) fail("listByStatus", error);
      return (data as MessageRow[]).map(toMessage);
    },

    async moderate({ id, action, by, at, releasedAt }) {
      const patch =
        action === "approve"
          ? { status: "approved", released_at: releasedAt, reject_reason: null }
          : {
              status: "rejected",
              released_at: null,
              reject_reason: action === "remove" ? "removed" : "operator",
            };

      const { data, error } = await getClient()
        .from("messages")
        .update({ ...patch, moderated_at: at, moderated_by: by })
        .eq("id", id)
        .select("*")
        .maybeSingle<MessageRow>();
      if (error) fail("moderate", error);
      return data ? toMessage(data) : null;
    },

    async markDisplayed(ids, at) {
      if (ids.length === 0) return;
      const { error } = await getClient()
        .from("messages")
        .update({ displayed_at: at })
        .in("id", [...ids])
        .is("displayed_at", null);
      if (error) fail("markDisplayed", error);
    },

    async countRecent(query: RateLimitQuery) {
      let q = getClient()
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("event_id", query.eventId)
        .gte("created_at", query.sinceIso);

      if (query.ipHash) q = q.eq("ip_hash", query.ipHash);
      if (query.sessionId) q = q.eq("session_id", query.sessionId);

      const { count, error } = await q;
      if (error) fail("countRecent", error);
      return count ?? 0;
    },

    async releaseAbandoned({ eventId, mode, operatorPresent }) {
      if (operatorPresent || mode === "manual") return [];

      const { data, error } = await getClient().rpc("release_abandoned", {
        p_event_id: eventId,
        p_min_age_s: Math.ceil(serverConfig.moderation.autoReleaseDelayMs / 1000),
      });
      if (error) fail("releaseAbandoned", error);
      return (data as MessageRow[]).map(toMessage);
    },

    async stats(eventId) {
      const countFor = async (status?: MessageStatus) => {
        let q = getClient()
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId);
        if (status) q = q.eq("status", status);
        const { count, error } = await q;
        if (error) fail("stats", error);
        return count ?? 0;
      };

      const [total, approved, pending, rejected] = await Promise.all([
        countFor(),
        countFor("approved"),
        countFor("pending"),
        countFor("rejected"),
      ]);
      return { total, approved, pending, rejected };
    },
  };
}
