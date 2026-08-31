"use client";

import { useCallback, useEffect, useState } from "react";

import { publicConfig } from "@/lib/config.public";
import type { ModerationMessage, ModerationMode } from "@/lib/domain/types";

/**
 * Console di moderazione.
 *
 * Pensata per un telefono tenuto con una mano, al buio, mentre la band suona.
 * Due bersagli grandi, nessun menu, nessuna conferma sulle azioni normali
 * (sono reversibili). L'unica che ne chiede una e' lo svuotamento dello
 * schermo, perche' quella non si torna indietro.
 *
 * Ha anche un ruolo che non si vede: il polling di questa pagina E' il segnale
 * di presenza dell'operatore. Aprirla o chiuderla e' l'unico gesto necessario
 * per cambiare il comportamento del sistema — se nessuno guarda, i messaggi
 * puliti escono da soli invece di restare bloccati in coda.
 */

interface Snapshot {
  event: { slug: string; name: string; moderationMode: ModerationMode; status: string };
  pending: ModerationMessage[];
  stats: { total: number; approved: number; pending: number; rejected: number };
}

const POLL_MS = 3000;

const MODE_LABELS: Record<ModerationMode, { title: string; hint: string }> = {
  manual: {
    title: "Manuale",
    hint: "Niente va a schermo senza la tua approvazione. Se chiudi questa pagina, lo schermo si ferma.",
  },
  assisted: {
    title: "Assistita",
    hint: "Mentre sei qui approvi tu. Se ti allontani, i messaggi puliti escono da soli e i dubbi restano fermi.",
  },
  auto: {
    title: "Automatica",
    hint: "Decide il filtro. I messaggi dubbi restano comunque qui ad aspettarti.",
  },
};

export function AdminConsole({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  /** Il panic button chiede due tap: un tocco per sbaglio non e' recuperabile. */
  const [armedPanic, setArmedPanic] = useState(false);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", "x-admin-token": token, ...init?.headers },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    [token],
  );

  const refresh = useCallback(async () => {
    try {
      const data = (await call(
        `/api/admin/queue?eventSlug=${publicConfig.event.slug}`,
      )) as Snapshot;
      setSnapshot(data);
      setError(null);
    } catch {
      setError("Connessione persa. Riprovo...");
    }
  }, [call]);

  useEffect(() => {
    // Il linter segnala il setState dentro un effetto: qui e' voluto e non e'
    // il caso che la regola vuole evitare. Non stiamo derivando stato da
    // props, stiamo interrogando il server a intervalli — e questo polling e'
    // anche il segnale di presenza dell'operatore. `refresh` e' asincrona,
    // quindi nessun setState avviene durante l'effetto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusy((prev) => new Set(prev).add(id));
    // Rimozione ottimistica: il tap deve sembrare istantaneo anche su 4G.
    setSnapshot((prev) =>
      prev ? { ...prev, pending: prev.pending.filter((m) => m.id !== id) } : prev,
    );

    try {
      await call("/api/admin/moderate", {
        method: "POST",
        body: JSON.stringify({ eventSlug: publicConfig.event.slug, id, action }),
      });
    } catch {
      setError("Azione non riuscita. Ricarico la coda.");
      void refresh();
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function control(body: Record<string, unknown>) {
    try {
      await call("/api/admin/control", { method: "POST", body: JSON.stringify(body) });
      void refresh();
    } catch {
      setError("Comando non riuscito.");
    }
  }

  if (!snapshot) {
    return (
      <p className="py-20 text-center text-ink-dim">
        {error ?? "Carico la coda..."}
      </p>
    );
  }

  const mode = snapshot.event.moderationMode;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Moderazione</h1>
          <span className="font-mono text-xs text-ink-faint tabular-nums">
            {snapshot.stats.approved} a schermo &middot; {snapshot.stats.rejected} bloccati
          </span>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-raised p-1">
            {(Object.keys(MODE_LABELS) as ModerationMode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void control({ action: "set-mode", mode: option })}
                className={`rounded-lg py-2.5 text-sm font-medium transition ${
                  mode === option ? "bg-ink text-black" : "text-ink-dim active:bg-line"
                }`}
              >
                {MODE_LABELS[option].title}
              </button>
            ))}
          </div>
          <p className="px-1 text-xs leading-relaxed text-ink-faint">{MODE_LABELS[mode].hint}</p>
        </div>
      </header>

      {error && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {error}
        </p>
      )}

      {snapshot.pending.length === 0 ? (
        <p className="py-16 text-center text-ink-faint">Nessun messaggio in attesa.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {snapshot.pending.map((message) => (
            <li
              key={message.id}
              className="overflow-hidden rounded-2xl border border-line bg-surface-raised"
            >
              <div className="space-y-2 p-4">
                {message.filterVerdict === "suspect" && (
                  <span className="inline-block rounded-full bg-amber-500/15 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-amber-400">
                    da verificare
                  </span>
                )}
                <p className="text-lg leading-snug text-ink">{message.body}</p>
                {message.name && <p className="text-sm text-ink-dim">&mdash; {message.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-px bg-line">
                <button
                  type="button"
                  disabled={busy.has(message.id)}
                  onClick={() => void moderate(message.id, "reject")}
                  className="bg-surface py-4 text-base font-semibold text-red-400 transition active:bg-red-500/15 disabled:opacity-40"
                >
                  Blocca
                </button>
                <button
                  type="button"
                  disabled={busy.has(message.id)}
                  onClick={() => void moderate(message.id, "approve")}
                  className="bg-surface py-4 text-base font-semibold text-emerald-400 transition active:bg-emerald-500/15 disabled:opacity-40"
                >
                  Manda a schermo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-stage/95 p-4 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            if (!armedPanic) {
              setArmedPanic(true);
              window.setTimeout(() => setArmedPanic(false), 4000);
              return;
            }
            setArmedPanic(false);
            void control({ action: "clear" });
          }}
          className={`w-full rounded-xl border py-3.5 text-sm font-semibold transition ${
            armedPanic
              ? "border-red-500 bg-red-500/20 text-red-200"
              : "border-red-500/40 text-red-400 active:bg-red-500/15"
          }`}
        >
          {armedPanic ? "Tocca di nuovo per confermare" : "Svuota lo schermo adesso"}
        </button>
      </div>
    </div>
  );
}
