"use client";

import Link from "next/link";
import { useState } from "react";

import { publicConfig } from "@/lib/config.public";
import type { ModerationMode } from "@/lib/domain/types";
import { useAdminSnapshot } from "./useAdminSnapshot";

/**
 * Console di moderazione.
 *
 * Pensata per un telefono tenuto con una mano, al buio, mentre la band suona.
 * Due bersagli grandi, nessun menu, nessuna conferma sulle azioni normali
 * (sono reversibili). Tutto cio' che si tocca poche volte per serata — il
 * cambio di modalita', il reset, lo svuotamento dello schermo — vive in
 * `/admin/settings`, apposta fuori da qui: questa pagina deve restare quella
 * su cui si sta per tutto lo show, senza distrazioni.
 *
 * Ha anche un ruolo che non si vede: il polling di questa pagina E' il segnale
 * di presenza dell'operatore. Aprirla o chiuderla e' l'unico gesto necessario
 * per cambiare il comportamento del sistema — se nessuno guarda, i messaggi
 * puliti escono da soli invece di restare bloccati in coda.
 */

const MODE_TITLES: Record<ModerationMode, string> = {
  manual: "Manuale",
  assisted: "Assistita",
  auto: "Automatica",
};

type Urgency = "low" | "normal" | "comfortable";

/**
 * Poche frasi in rotazione e' il segnale che conta per il moderatore:
 * sotto `lowRotationThreshold` serve intervenire, sopra
 * `comfortableRotationThreshold` non c'e' da pensarci per un pezzo.
 */
function rotationUrgency(count: number): Urgency {
  const { lowRotationThreshold, comfortableRotationThreshold } = publicConfig.moderation;
  if (count < lowRotationThreshold) return "low";
  if (count < comfortableRotationThreshold) return "normal";
  return "comfortable";
}

const URGENCY_DOT: Record<Urgency, string> = {
  low: "bg-red-500/20 text-red-300",
  normal: "bg-amber-500/20 text-amber-300",
  comfortable: "bg-emerald-500/20 text-emerald-300",
};

function StatDot({ value, urgency }: { value: number; urgency: Urgency | "neutral" }) {
  const palette = urgency === "neutral" ? "bg-surface-raised text-ink-dim" : URGENCY_DOT[urgency];
  return (
    <span
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-mono text-xs font-semibold tabular-nums ${palette}`}
    >
      {value}
    </span>
  );
}

export function AdminConsole() {
  const { snapshot, setSnapshot, error, setError, call, confirmed, refresh } =
    useAdminSnapshot();
  /** Conferma non urgente (es. "10 frasi aggiunte."), separata dagli errori. */
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Map<string, "approve" | "reject">>(new Map());
  const [addingSynthetic, setAddingSynthetic] = useState(false);
  /** Due tap: un tocco per sbaglio non deve chiudere o riaprire la serata. */
  const [armedEventToggle, setArmedEventToggle] = useState(false);

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

  async function addSynthetic() {
    setAddingSynthetic(true);
    setError(null);
    setNotice(null);
    try {
      const result = (await call("/api/admin/control", {
        method: "POST",
        body: JSON.stringify({ action: "add-synthetic", eventSlug: publicConfig.event.slug }),
      })) as { added: number; available: number };
      setNotice(`${result.added} frasi aggiunte.`);
      // Aggiorna subito il residuo disponibile, senza aspettare il prossimo
      // poll: e' quello che disabilita il pulsante non appena si esaurisce.
      setSnapshot((prev) => (prev ? { ...prev, syntheticAvailable: result.available } : prev));
      void refresh();
    } catch {
      setError("Aggiunta non riuscita.");
    } finally {
      setAddingSynthetic(false);
    }
  }

  async function endEvent() {
    try {
      await call("/api/admin/control", {
        method: "POST",
        body: JSON.stringify({ action: "end-event", eventSlug: publicConfig.event.slug }),
      });
      void refresh();
    } catch {
      setError("Chiusura non riuscita. Riprova.");
    }
  }

  async function reopenEvent() {
    try {
      await call("/api/admin/control", {
        method: "POST",
        body: JSON.stringify({ action: "reopen-event", eventSlug: publicConfig.event.slug }),
      });
      void refresh();
    } catch {
      setError("Riapertura non riuscita. Riprova.");
    }
  }

  if (!snapshot) {
    return (
      <p className="py-20 text-center text-ink-dim">
        {error ?? "Carico la coda..."}
      </p>
    );
  }

  const urgency = rotationUrgency(snapshot.stats.rotating);
  const syntheticExhausted = snapshot.syntheticAvailable === 0;
  let syntheticButtonLabel = "+ Aggiungi 10 frasi pronte";
  if (addingSynthetic) syntheticButtonLabel = "Aggiungo...";
  else if (syntheticExhausted) syntheticButtonLabel = "Frasi pronte esaurite";

  return (
    <>
      <div className="flex flex-col gap-6 pb-28">
        <header className="space-y-3">
          <h1 className="text-xl font-semibold">Moderazione</h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <StatDot value={snapshot.stats.rotating} urgency={urgency} />
              in rotazione
            </span>
            {snapshot.event.moderationMode !== "auto" && (
              <span className="inline-flex items-center gap-1.5">
                <StatDot value={snapshot.stats.pending} urgency="neutral" />
                in coda
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <StatDot value={snapshot.stats.rejected} urgency="neutral" />
              bloccati
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-faint">
              Modalità: <span className="font-medium text-ink-dim">{MODE_TITLES[snapshot.event.moderationMode]}</span>
            </span>
            <Link href="/admin/settings" className="text-ink-faint underline underline-offset-2">
              Impostazioni
            </Link>
          </div>

          <div className="space-y-2">
            {urgency === "low" && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300">
                {syntheticExhausted
                  ? "Poche frasi in rotazione, e le frasi pronte sono finite."
                  : "Poche frasi in rotazione: aggiungi 10 frasi pronte."}
              </p>
            )}
            <button
              type="button"
              onClick={() => void addSynthetic()}
              disabled={addingSynthetic || syntheticExhausted}
              className="w-full rounded-xl border border-line py-3 text-sm font-medium text-ink-dim transition active:bg-line disabled:opacity-60"
            >
              {syntheticButtonLabel}
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
      </div>

      {/* Fissa in fondo allo schermo, non in coda alla pagina: deve restare
          raggiungibile con un pollice anche a lista lunga, senza scorrere.
          Vive qui e non in /admin/settings perche' e' l'unica azione grave
          che serve esattamente nel momento in cui questa pagina e' aperta.
          Contestuale: chiudi/riapri non stanno mai insieme, e' sempre l'una
          o l'altra a seconda di come sta l'evento adesso. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-lg">
          {snapshot.event.status === "ended" ? (
            <button
              type="button"
              onClick={() => {
                if (!armedEventToggle) {
                  setArmedEventToggle(true);
                  window.setTimeout(() => setArmedEventToggle(false), 4000);
                  return;
                }
                setArmedEventToggle(false);
                void reopenEvent();
              }}
              className={`w-full rounded-xl border py-3.5 text-sm font-semibold transition ${
                armedEventToggle
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                  : "border-emerald-500/40 text-emerald-400 active:bg-emerald-500/15"
              }`}
            >
              {armedEventToggle ? "Tocca di nuovo per confermare" : "Riapri la serata"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!armedEventToggle) {
                  setArmedEventToggle(true);
                  window.setTimeout(() => setArmedEventToggle(false), 4000);
                  return;
                }
                setArmedEventToggle(false);
                void endEvent();
              }}
              className={`w-full rounded-xl border py-3.5 text-sm font-semibold transition ${
                armedEventToggle
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-accent/40 text-accent active:bg-accent/15"
              }`}
            >
              {armedEventToggle ? "Tocca di nuovo per confermare" : "Chiudi la serata"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
