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
}: {
  status: ConnectionStatus;
  queueDepth: number;
}) {
  const { color, label } = APPEARANCE[status];

  return (
    <div className="absolute bottom-4 right-5 flex items-center gap-2 opacity-40">
      <span className={`size-1.5 rounded-full ${color}`} aria-hidden />
      <span className="sr-only">{label}</span>
      {queueDepth > 0 && (
        <span className="font-mono text-[0.6rem] text-ink-faint tabular-nums">
          {queueDepth}
        </span>
      )}
    </div>
  );
}
