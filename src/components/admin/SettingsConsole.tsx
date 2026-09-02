"use client";

import Link from "next/link";
import { useState } from "react";

import type { ModerationMode } from "@/lib/domain/types";
import { useAdminSnapshot } from "./useAdminSnapshot";

/**
 * Impostazioni: tutto cio' che si tocca poche volte per serata — modalita' di
 * moderazione, reset di prova, svuotamento dello schermo — separato dalla
 * console principale apposta perche' non deve distrarre chi sta approvando
 * messaggi per due ore di fila.
 */

const MODE_LABELS: Record<ModerationMode, { title: string; hint: string }> = {
  manual: {
    title: "Manuale",
    hint: "Niente va a schermo senza la tua approvazione. Se chiudi la console, lo schermo si ferma.",
  },
  assisted: {
    title: "Assistita",
    hint: "Mentre sei sulla console approvi tu. Se ti allontani, i messaggi puliti escono da soli e i dubbi restano fermi.",
  },
  auto: {
    title: "Automatica",
    hint: "Decide il filtro. I messaggi dubbi restano comunque in coda ad aspettarti.",
  },
};

export function SettingsConsole() {
  const { snapshot, error, call, refresh } = useAdminSnapshot();
  /** Panic e reset chiedono due tap: un tocco per sbaglio non e' recuperabile. */
  const [armedPanic, setArmedPanic] = useState(false);
  const [armedPurge, setArmedPurge] = useState(false);

  async function control(body: Record<string, unknown>) {
    try {
      await call("/api/admin/control", { method: "POST", body: JSON.stringify(body) });
      void refresh();
    } catch {
      // L'errore di connessione e' gia' mostrato da useAdminSnapshot al
      // prossimo poll: qui basta non far sparire l'armatura in silenzio.
    }
  }

  if (!snapshot) {
    return (
      <p className="py-20 text-center text-ink-dim">
        {error ?? "Carico le impostazioni..."}
      </p>
    );
  }

  const mode = snapshot.event.moderationMode;

  return (
    <div className="flex flex-col gap-6 pb-6">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">Impostazioni</h1>
          <Link href="/admin" className="text-xs text-ink-faint underline underline-offset-2">
            &larr; Moderazione
          </Link>
        </div>
      </header>

      {error && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {error}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-ink-dim">Modalità di moderazione</h2>
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
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-medium text-ink-dim">Emergenza</h2>
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
      </section>

      {/* Reset dei messaggi: volutamente defilato, non un bottone come quello
          sopra. Serve poche volte (es. il pomeriggio del concerto, dopo aver
          testato che tutto funzioni) ed e' irreversibile. */}
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
    </div>
  );
}
