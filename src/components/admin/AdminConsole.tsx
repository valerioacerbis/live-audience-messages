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

type Urgency = "low" | "normal" | "comfortable" | "overflow";

/**
 * Quante frasi ci sono in rotazione rispetto alla durata della canzone e' il
 * segnale che conta per il moderatore: sotto `lowRotationThreshold` serve
 * intervenire, da `comfortableRotationThreshold` bastano per tutto il brano,
 * da `overflowRotationThreshold` sono piu' di quante ne entrino.
 */
function rotationUrgency(count: number): Urgency {
  const { lowRotationThreshold, comfortableRotationThreshold, overflowRotationThreshold } =
    publicConfig.moderation;
  if (count < lowRotationThreshold) return "low";
  if (count < comfortableRotationThreshold) return "normal";
  if (count < overflowRotationThreshold) return "comfortable";
  return "overflow";
}

const URGENCY_LIGHT: Record<Urgency, string> = {
  low: "bg-red-500",
  normal: "bg-amber-400",
  comfortable: "bg-emerald-500",
  overflow: "bg-sky-400",
};

/** Etichette della legenda: brevi, da leggere al buio con un'occhiata. */
const URGENCY_LEGEND: { urgency: Urgency; range: string; label: string }[] = (() => {
  const { lowRotationThreshold: low, comfortableRotationThreshold: ok, overflowRotationThreshold: max } =
    publicConfig.moderation;
  return [
    { urgency: "low", range: `0–${low - 1}`, label: "Poche: si ripetono di continuo" },
    { urgency: "normal", range: `${low}–${ok - 1}`, label: "Non bastano: alcune si ripeteranno" },
    { urgency: "comfortable", range: `${ok}–${max - 1}`, label: "Bastano per tutta la canzone" },
    { urgency: "overflow", range: `${max}+`, label: "Più della canzone: le ultime usciranno dopo" },
  ];
})();

function RotationLight({ count, urgency }: Readonly<{ count: number; urgency: Urgency }>) {
  const current = URGENCY_LEGEND.find((row) => row.urgency === urgency);
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-raised p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className={`h-5 w-5 shrink-0 rounded-full ${URGENCY_LIGHT[urgency]}`} />
        <div className="leading-tight">
          <p className="text-base font-semibold text-ink">
            <span className="font-mono tabular-nums">{count}</span> frasi in rotazione
          </p>
          <p className="text-sm text-ink-dim">{current?.label}</p>
        </div>
      </div>
      <ul className="space-y-1 border-t border-line pt-3 text-xs">
        {URGENCY_LEGEND.map((row) => (
          <li
            key={row.urgency}
            className={`flex items-center gap-2 ${row.urgency === urgency ? "text-ink" : "text-ink-faint"}`}
          >
            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${URGENCY_LIGHT[row.urgency]}`} />
            <span className="w-12 shrink-0 font-mono tabular-nums">{row.range}</span>
            <span>{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatDot({ value }: Readonly<{ value: number }>) {
  return (
    <span
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-raised px-1.5 font-mono text-xs font-semibold tabular-nums text-ink-dim"
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

          <RotationLight count={snapshot.stats.rotating} urgency={urgency} />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-faint">
            {snapshot.event.moderationMode !== "auto" && (
              <span className="inline-flex items-center gap-1.5">
                <StatDot value={snapshot.stats.pending} />
                in coda
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <StatDot value={snapshot.stats.rejected} />
              bloccati
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-faint">
              Modalità: <span className="font-medium text-ink-dim">{MODE_TITLES[snapshot.event.moderationMode]}</span>
            </span>
            <span className="flex gap-3">
              <Link href="/admin/review" className="text-ink-faint underline underline-offset-2">
                Revisione
              </Link>
              <Link href="/admin/settings" className="text-ink-faint underline underline-offset-2">
                Impostazioni
              </Link>
            </span>
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
              {armedEventToggle ? "Tocca di nuovo per confermare" : "Rimetti i messaggi a schermo"}
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
              {armedEventToggle ? "Tocca di nuovo per confermare" : "Vai alla schermata finale"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
