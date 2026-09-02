import { serverConfig } from "../config";
import type { FilterVerdict, MessageRecord, ModerationMode, RejectReason } from "./types";

/**
 * Politica di moderazione: decide cosa succede a un messaggio appena arrivato
 * e cosa fare di quelli rimasti in coda.
 *
 * Il problema che risolve non e' "filtrare le parolacce" — quello lo fa
 * `moderation.ts`. E' il problema opposto: se la moderazione manuale e'
 * attiva e l'operatore non c'e' (o si distrae, o gli muore il telefono),
 * la coda non si svuota e il maxischermo resta nero per tutto il concerto.
 * Un sistema che funziona perfettamente e non mostra niente.
 *
 * Da qui il dead-man switch: la presenza dell'operatore e' un fatto osservato
 * (un heartbeat da /admin), non una configurazione. Aprire o chiudere /admin
 * e' l'unico gesto necessario per cambiare il comportamento del sistema.
 */

export interface OperatorPresence {
  present: boolean;
  /** Ultimo heartbeat ricevuto, `null` se nessuno ha mai aperto /admin. */
  lastSeenAt: string | null;
}

export interface IntakeContext {
  mode: ModerationMode;
  verdict: FilterVerdict;
  operatorPresent: boolean;
}

export type IntakeDecision =
  | { status: "rejected"; reason: RejectReason; decidedBy: "auto" }
  | { status: "pending" }
  | { status: "approved"; decidedBy: "auto" };

export function isOperatorPresent(lastSeenAt: string | null, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) return false;
  return now - seen < serverConfig.moderation.operatorTimeoutMs;
}

/** Cosa fare di un messaggio nell'istante in cui arriva. */
export function decideIntake(ctx: IntakeContext): IntakeDecision {
  // Il livello `blocked` non arriva mai a un umano: non c'e' niente da valutare.
  if (ctx.verdict === "blocked") {
    return { status: "rejected", reason: "profanity", decidedBy: "auto" };
  }

  switch (ctx.mode) {
    case "manual":
      // Fiducia zero nell'automatismo. Se non c'e' nessuno, non esce niente:
      // e' esattamente cio' che questa modalita' promette.
      return { status: "pending" };

    case "auto":
      // Il filtro decide. I `suspect` restano comunque in coda: "auto" non
      // significa "pubblica qualunque cosa".
      return ctx.verdict === "clean"
        ? { status: "approved", decidedBy: "auto" }
        : { status: "pending" };

    case "assisted":
      // Con un operatore attivo si comporta come `manual`; senza, i messaggi
      // puliti escono da soli e i dubbi restano fermi.
      if (ctx.operatorPresent) return { status: "pending" };
      return ctx.verdict === "clean"
        ? { status: "approved", decidedBy: "auto" }
        : { status: "pending" };

    default: {
      const exhaustive: never = ctx.mode;
      return exhaustive;
    }
  }
}

/**
 * Sweeper: libera i messaggi puliti rimasti `pending` troppo a lungo.
 *
 * Non guarda la presenza dell'operatore: dipendeva dall'heartbeat di
 * `/admin`, ma una scheda lasciata aperta senza che nessuno la guardi
 * continua a mandare heartbeat e bloccherebbe il rilascio per sempre — esattamente
 * il buco che il dead-man switch doveva evitare. L'unico segnale affidabile
 * e' quanto un messaggio e' rimasto in coda senza una decisione umana.
 *
 * Viene invocato dalla GET del display, che gira comunque ogni pochi secondi:
 * zero cron, zero infrastruttura in piu'.
 */
export function shouldAutoRelease(
  message: MessageRecord,
  mode: ModerationMode,
  now = Date.now(),
): boolean {
  if (message.status !== "pending") return false;
  if (mode === "manual") return false;
  if (message.filterVerdict !== "clean") return false;

  const age = now - Date.parse(message.createdAt);
  return age >= serverConfig.moderation.autoReleaseDelayMs;
}

/**
 * Ritardo tra approvazione e comparsa a schermo.
 *
 * Serve solo quando ha deciso una macchina: e' la finestra in cui un umano
 * puo' ancora fermare il messaggio. Se ha appena deciso un umano, la finestra
 * non ha senso e aggiungerebbe solo latenza.
 */
export function releaseDelayMs(decidedBy: "auto" | "operator"): number {
  return decidedBy === "auto" ? serverConfig.moderation.displayDelayMs : 0;
}

export function releaseTimestamp(decidedBy: "auto" | "operator", now = Date.now()): string {
  return new Date(now + releaseDelayMs(decidedBy)).toISOString();
}
