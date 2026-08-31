"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  stats: { total: number; approved: number; pending: number; rejected: number; rotating: number };
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
  /** Conferma non urgente (es. "10 frasi aggiunte."), separata dagli errori. */
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Map<string, "approve" | "reject">>(new Map());
  const [addingSynthetic, setAddingSynthetic] = useState(false);
  /**
   * Id gia' moderati con successo, anche se il prossimo poll non se ne e'
   * ancora accorto.
   *
   * Serve contro una corsa precisa: con piu' messaggi approvati di fila e
   * molto in fretta, un poll partito PRIMA dei click puo' rispondere DOPO,
   * portando ancora quei messaggi come "pending" e facendoli ricomparire per
   * un istante. Un id qui dentro non puo' mai tornare pending — una volta
   * moderato non lo e' piu' — quindi filtrarlo da ogni snapshot successivo e'
   * sempre corretto, non solo "per ora".
   */
  const confirmed = useRef<Set<string>>(new Set());
  /** Il panic button chiede due tap: un tocco per sbaglio non e' recuperabile. */
  const [armedPanic, setArmedPanic] = useState(false);
  /** Stesso schema del panic button: due tap, e questo cancella per davvero. */
  const [armedPurge, setArmedPurge] = useState(false);

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
      // Un poll partito prima di un'approvazione puo' arrivare dopo: non deve
      // far ricomparire cio' che sappiamo gia' essere stato moderato.
      setSnapshot({
        ...data,
        pending: data.pending.filter((m) => !confirmed.current.has(m.id)),
      });
      setError(null);
    } catch {
      setError("Connessione persa. Riprovo...");
    }
  }, [call]);

  useEffect(() => {
    // `refresh` e' asincrona: nessun setState avviene durante l'effetto in
    // se', solo dopo — stiamo interrogando il server a intervalli, e questo
    // polling e' anche il segnale di presenza dell'operatore.
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function moderate(id: string, action: "approve" | "reject") {
    // Niente rimozione ottimistica: il messaggio resta visibile, con un
    // loader al posto dei bottoni, finche' il server non conferma davvero.
    // Con tanti "Manda a schermo" premuti in fretta, un'uscita anticipata e'
    // proprio cio' che faceva ricomparire messaggi gia' approvati.
    setBusy((prev) => new Map(prev).set(id, action));

    try {
      await call("/api/admin/moderate", {
        method: "POST",
        body: JSON.stringify({ eventSlug: publicConfig.event.slug, id, action }),
      });
      confirmed.current.add(id);
      setSnapshot((prev) =>
        prev ? { ...prev, pending: prev.pending.filter((m) => m.id !== id) } : prev,
      );
    } catch {
      setError("Azione non riuscita. Ricarico la coda.");
      void refresh();
    } finally {
      setBusy((prev) => {
        const next = new Map(prev);
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

  async function addSynthetic() {
    setAddingSynthetic(true);
    setError(null);
    setNotice(null);
    try {
      const result = (await call("/api/admin/control", {
        method: "POST",
        body: JSON.stringify({ action: "add-synthetic", eventSlug: publicConfig.event.slug }),
      })) as { added: number };
      setNotice(`${result.added} frasi aggiunte.`);
      void refresh();
    } catch {
      setError("Aggiunta non riuscita.");
    } finally {
      setAddingSynthetic(false);
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
  const lowRotation = snapshot.stats.rotating < publicConfig.moderation.lowRotationThreshold;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <header className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Moderazione</h1>
          <span className="font-mono text-xs text-ink-faint tabular-nums">
            {snapshot.stats.rotating} in rotazione &middot; {snapshot.stats.approved} a schermo
            (tot.) &middot; {snapshot.stats.rejected} bloccati
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

        <div className="space-y-2">
          {lowRotation && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
              Poche frasi in rotazione: valuta di aggiungerne con il pulsante qui sotto.
            </p>
          )}
          <button
            type="button"
            onClick={() => void addSynthetic()}
            disabled={addingSynthetic}
            className="w-full rounded-xl border border-line py-3 text-sm font-medium text-ink-dim transition active:bg-line disabled:opacity-60"
          >
            {addingSynthetic ? "Aggiungo..." : "+ Aggiungi 10 frasi pronte"}
          </button>
        </div>

        {/* Reset dei messaggi: volutamente defilato, non un bottone come gli
            altri due. Serve poche volte (es. il pomeriggio del concerto, dopo
            aver testato che tutto funzioni) ed e' irreversibile — non deve
            essere a portata dello stesso gesto veloce usato durante lo show. */}
        <div className="px-1 text-right">
          <button
            type="button"
            onClick={() => {
              if (!armedPurge) {
                setArmedPurge(true);
                window.setTimeout(() => setArmedPurge(false), 4000);
                return;
              }
              setArmedPurge(false);
              void control({ action: "purge" });
            }}
            className={`text-[0.7rem] underline-offset-2 transition ${
              armedPurge
                ? "font-semibold text-red-500 underline"
                : "text-ink-faint/60 active:text-ink-faint"
            }`}
          >
            {armedPurge ? "Tocca di nuovo: cancella tutto per sempre" : "Reset messaggi (test)"}
          </button>
        </div>
      </header>

      {error && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {snapshot.pending.length === 0 ? (
        <p className="py-16 text-center text-ink-faint">Nessun messaggio in attesa.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {snapshot.pending.map((message) => {
            const pendingAction = busy.get(message.id);
            return (
              <li
                key={message.id}
                className={`overflow-hidden rounded-2xl border border-line bg-surface-raised transition-opacity ${
                  pendingAction ? "opacity-60" : ""
                }`}
              >
                <div className="space-y-2 p-4">
                  {message.filterVerdict === "suspect" && (
                    <span className="inline-block rounded-full bg-amber-500/15 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-amber-400">
                      da verificare
                    </span>
                  )}
                  {message.source === "synthetic" && (
                    <span className="inline-block rounded-full bg-sky-500/15 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-sky-400">
                      🤖 pre-scritta
                    </span>
                  )}
                  <p className="text-lg leading-snug text-ink">{message.body}</p>
                  {message.name && <p className="text-sm text-ink-dim">&mdash; {message.name}</p>}
                </div>

                {pendingAction ? (
                  <div className="flex items-center justify-center gap-2 border-t border-line bg-surface py-4 text-sm font-medium text-ink-dim">
                    <span
                      aria-hidden
                      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    />
                    {pendingAction === "approve" ? "Invio a schermo..." : "Blocco..."}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-px bg-line">
                    <button
                      type="button"
                      onClick={() => void moderate(message.id, "reject")}
                      className="bg-surface py-4 text-base font-semibold text-red-400 transition active:bg-red-500/15"
                    >
                      Blocca
                    </button>
                    <button
                      type="button"
                      onClick={() => void moderate(message.id, "approve")}
                      className="bg-surface py-4 text-base font-semibold text-emerald-400 transition active:bg-emerald-500/15"
                    >
                      Manda a schermo
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 flex flex-col gap-2 border-t border-line bg-stage/95 p-4 backdrop-blur">
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
