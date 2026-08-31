/** Modello dati condiviso. Nessuna dipendenza da React, Next o dal database. */

export type MessageStatus = "pending" | "approved" | "rejected";

/**
 * Come si comporta il sistema quando arriva un messaggio.
 * - `manual`   : tutto passa dall'operatore, nessun rilascio automatico.
 * - `assisted` : default. Con operatore presente si comporta come `manual`;
 *                se l'operatore sparisce, i messaggi puliti escono da soli.
 * - `auto`     : decide solo il filtro, l'operatore guarda e puo' intervenire.
 */
export type ModerationMode = "manual" | "assisted" | "auto";

/**
 * Esito del filtro automatico. Tre livelli, non due: il livello intermedio
 * e' quello che permette di non mostrare mai nulla di dubbio quando non
 * c'e' nessuno a controllare.
 */
export type FilterVerdict = "clean" | "suspect" | "blocked";

export type RejectReason =
  | "profanity"
  | "spam"
  | "operator"
  | "expired_unattended"
  | "removed";

export interface EventRecord {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "live" | "ended";
  moderationMode: ModerationMode;
  /** Ultimo heartbeat da /admin: e' il segnale del dead-man switch. */
  operatorLastSeenAt: string | null;
  /** Panic button: nulla rilasciato prima di questo istante torna a schermo. */
  clearedAt: string | null;
  createdAt: string;
  endedAt: string | null;
}

export interface MessageRecord {
  id: string;
  eventId: string;
  body: string;
  authorName: string | null;
  status: MessageStatus;
  filterVerdict: FilterVerdict;
  rejectReason: RejectReason | null;
  createdAt: string;
  /**
   * Istante in cui il messaggio e' diventato visibile al display.
   * E' questo (non `createdAt`) il campo su cui scorre il cursore del display:
   * un messaggio approvato dieci minuti dopo l'invio deve comunque arrivare
   * a schermo, e con un cursore su `createdAt` verrebbe saltato per sempre.
   */
  releasedAt: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  displayedAt: string | null;
  ipHash: string;
  sessionId: string;
  clientMsgId: string;
}

/** Proiezione sicura: l'unica forma che esce verso il browser. */
export interface PublicMessage {
  id: string;
  body: string;
  name: string | null;
  createdAt: string;
  releasedAt: string;
}

/** Vista per la coda di moderazione. Include il verdetto del filtro. */
export interface ModerationMessage {
  id: string;
  body: string;
  name: string | null;
  status: MessageStatus;
  filterVerdict: FilterVerdict;
  createdAt: string;
}

export function toPublicMessage(m: MessageRecord): PublicMessage {
  return {
    id: m.id,
    body: m.body,
    name: m.authorName,
    createdAt: m.createdAt,
    releasedAt: m.releasedAt ?? m.createdAt,
  };
}

export function toModerationMessage(m: MessageRecord): ModerationMessage {
  return {
    id: m.id,
    body: m.body,
    name: m.authorName,
    status: m.status,
    filterVerdict: m.filterVerdict,
    createdAt: m.createdAt,
  };
}
