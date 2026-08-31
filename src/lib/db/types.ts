import type {
  EventRecord,
  FilterVerdict,
  MessageRecord,
  MessageStatus,
  ModerationMode,
  RejectReason,
} from "../domain/types";

/**
 * Contratto del data layer.
 *
 * Esiste in due implementazioni: `memory` (file JSON, zero servizi esterni) e
 * `supabase` (Postgres). Non e' un'astrazione di comodo: e' cio' che permette
 * di sviluppare e provare tutto senza account, ed e' la stessa leva che
 * servirebbe per il piano di riserva offline se al locale non ci fosse rete.
 */

export interface NewMessage {
  eventId: string;
  body: string;
  authorName: string | null;
  status: MessageStatus;
  filterVerdict: FilterVerdict;
  rejectReason: RejectReason | null;
  releasedAt: string | null;
  moderatedBy: string | null;
  ipHash: string;
  sessionId: string;
  clientMsgId: string;
}

export interface RateLimitQuery {
  eventId: string;
  sinceIso: string;
  ipHash?: string;
  sessionId?: string;
}

export type ModerationAction = "approve" | "reject" | "remove";

export interface Repository {
  /* --- eventi --- */
  getEvent(slug: string): Promise<EventRecord | null>;
  ensureEvent(slug: string, name: string, mode: ModerationMode): Promise<EventRecord>;
  setModerationMode(eventId: string, mode: ModerationMode): Promise<void>;
  /** Panic button: da questo istante in poi nulla di precedente torna a schermo. */
  clearDisplay(eventId: string, at: string): Promise<void>;

  /* --- presenza operatore (dead-man switch) --- */
  touchOperator(eventId: string, at: string): Promise<void>;
  getOperatorLastSeen(eventId: string): Promise<string | null>;

  /* --- messaggi --- */
  /**
   * Inserisce, oppure restituisce quello gia' presente con lo stesso
   * `clientMsgId`. E' l'idempotenza che evita il doppione a schermo quando
   * la risposta si perde e l'utente ritocca INVIA.
   */
  insertMessage(input: NewMessage): Promise<{ message: MessageRecord; created: boolean }>;

  /**
   * Cercato PRIMA del rate limit: un rinvio dello stesso messaggio non e' un
   * nuovo messaggio, e su una rete che perde le risposte e' il caso piu'
   * frequente di tutti.
   */
  findByClientMsgId(eventId: string, clientMsgId: string): Promise<MessageRecord | null>;

  /** Messaggi visibili al display, in ordine di rilascio. */
  listReleased(args: {
    eventId: string;
    since: string | null;
    limit: number;
    now: string;
  }): Promise<MessageRecord[]>;

  listByStatus(eventId: string, status: MessageStatus, limit: number): Promise<MessageRecord[]>;

  moderate(args: {
    id: string;
    action: ModerationAction;
    by: string;
    at: string;
    releasedAt: string | null;
  }): Promise<MessageRecord | null>;

  markDisplayed(ids: readonly string[], at: string): Promise<void>;

  countRecent(query: RateLimitQuery): Promise<number>;

  /** Sweeper del dead-man switch: rilascia i pending rimasti senza operatore. */
  releaseAbandoned(args: {
    eventId: string;
    mode: ModerationMode;
    operatorPresent: boolean;
    now: number;
  }): Promise<MessageRecord[]>;

  stats(eventId: string): Promise<{
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  }>;
}
