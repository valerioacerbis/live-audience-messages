"use client";

import type { ConnectionStatus } from "@/lib/realtime/transport";

/**
 * Indicatore di stato.
 *
 * Sei pixel in un angolo: leggibile dall'operatore a mezzo metro, invisibile
 * al pubblico a venti. Su un maxischermo non deve MAI comparire un banner
 * "connessione persa" — il pubblico non puo' farci nulla e rovinerebbe la
 * scena. Chi deve saperlo e' una persona sola, e quella persona e' vicina
 * allo schermo.
 *
 * Il numero e' "nuovi/totale": quanti messaggi sono appena arrivati e non
 * ancora andati in scena, su quanti sono validi in tutto dall'inizio della
 * serata. Un messaggio ritirato dopo l'approvazione (bloccato per errore da
 * `/admin/review`) esce da entrambi i numeri, cosi' coincidono sempre con
 * quello che un ricaricamento della pagina ricalcolerebbe da zero.
 */

const APPEARANCE: Record<ConnectionStatus, { color: string; label: string }> = {
  connecting: { color: "bg-yellow-500", label: "connessione in corso" },
  live: { color: "bg-emerald-500", label: "realtime attivo" },
  polling: { color: "bg-sky-500", label: "aggiornamento periodico" },
  offline: { color: "bg-red-500", label: "rete assente" },
};

export function ConnectionDot({
  status,
  queueDepth,
  totalReceived,
}: {
  status: ConnectionStatus;
  /** Messaggi nuovi, non ancora andati in scena. */
  queueDepth: number;
  /** Messaggi ricevuti e ancora validi (un ritiro dopo l'approvazione li toglie da qui). */
  totalReceived: number;
}) {
  const { color, label } = APPEARANCE[status];

  return (
    <div className="absolute bottom-4 left-5 flex items-center gap-2 opacity-40">
      <span className={`size-1.5 rounded-full ${color}`} aria-hidden />
      <span className="sr-only">{label}</span>
      {totalReceived > 0 && (
        <span className="font-mono text-[0.6rem] font-semibold text-white tabular-nums">
          {queueDepth}
          <span className="text-white/60">/{totalReceived}</span>
        </span>
      )}
    </div>
  );
}
