"use client";

import Link from "next/link";
import { useState } from "react";

import { publicConfig } from "@/lib/config.public";
import { countGraphemes } from "@/lib/domain/sanitize";
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
    hint: "Approvi sempre tu, messaggio per messaggio. Se chiudi questa pagina (o perdi la connessione), la coda si ferma e aspetta il tuo ritorno.",
  },
  assisted: {
    title: "Assistita",
    hint: "I messaggi puliti aspettano un attimo un tuo tap: se non arriva, passano da soli lo stesso, che questa pagina sia aperta o no. I dubbi restano in coda ad aspettarti.",
  },
  auto: {
    title: "Automatica",
    hint: "Decide sempre il filtro, che tu ci sia o no. I messaggi dubbi restano comunque in coda ad aspettarti.",
  },
};

export function SettingsConsole() {
  const { snapshot, error, call, refresh } = useAdminSnapshot();
  /** Panic e reset chiedono due tap: un tocco per sbaglio non e' recuperabile. */
  const [armedPanic, setArmedPanic] = useState(false);
  const [armedPurge, setArmedPurge] = useState(false);
  /**
   * `null` finche' non si tocca il campo: l'input mostra il valore che arriva
   * dal poll. Appena si scrive, il poll successivo non deve piu' sovrascrivere
   * quello che si sta digitando, quindi si passa a mostrare solo il draft
   * locale finche' non si salva (o non si ricarica la pagina).
   */
  const [phraseDraft, setPhraseDraft] = useState<string | null>(null);
  const [savingPhrase, setSavingPhrase] = useState(false);
  const [phraseSaved, setPhraseSaved] = useState(false);
  const [phraseError, setPhraseError] = useState<string | null>(null);

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
  const phraseValue = phraseDraft ?? snapshot.event.closingPhrase;
  const phraseMaxLength = publicConfig.limits.closingPhraseMaxLength;
  const phraseLength = countGraphemes(phraseValue);
  const phraseTooLong = phraseLength > phraseMaxLength;
  let phraseButtonLabel = "Salva";
  if (savingPhrase) phraseButtonLabel = "Salvo...";
  else if (phraseSaved) phraseButtonLabel = "Salvato";

  /**
   * Non riusa `control()`: quello ignora ogni errore in silenzio (va bene per
   * mode/panic/purge, dove non c'e' niente da perdere), ma qui un fallimento
   * silenzioso lascerebbe intendere che la frase sia stata salvata mentre non
   * lo e' — e butterebbe via quello che si e' appena scritto.
   */
  async function savePhrase() {
    setSavingPhrase(true);
    setPhraseSaved(false);
    setPhraseError(null);
    try {
      await call("/api/admin/control", {
        method: "POST",
        body: JSON.stringify({ action: "set-closing-phrase", phrase: phraseValue }),
      });
      // Atteso (non fire-and-forget): se il draft si azzera prima che lo
      // snapshot sia aggiornato, il campo mostra per un istante la frase
      // vecchia prima che arrivi quella nuova. Aspettando, il passaggio
      // draft -> snapshot avviene con il valore gia' aggiornato.
      await refresh();
      setPhraseDraft(null);
      setPhraseSaved(true);
      window.setTimeout(() => setPhraseSaved(false), 2000);
    } catch {
      // Il draft resta: un salvataggio fallito non deve far perdere quello
      // che si e' appena scritto.
      setPhraseError("Salvataggio non riuscito. Riprova.");
    } finally {
      setSavingPhrase(false);
    }
  }

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
        <h2 className="px-1 text-sm font-medium text-ink-dim">Schermata finale</h2>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between px-1">
            <label htmlFor="closing-phrase" className="text-xs text-ink-faint">
              Frase di chiusura
            </label>
            <span className={`text-xs tabular-nums ${phraseTooLong ? "text-red-400" : "text-ink-faint"}`}>
              {phraseLength} / {phraseMaxLength}
            </span>
          </div>
          <textarea
            id="closing-phrase"
            value={phraseValue}
            onChange={(e) => setPhraseDraft(e.target.value)}
            rows={2}
            disabled={savingPhrase}
            aria-busy={savingPhrase}
            className="w-full rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-opacity disabled:opacity-50"
            placeholder="Frase mostrata a schermo quando premi «Vai alla schermata finale»"
          />
        </div>
        {phraseError && (
          <p role="status" className="px-1 text-xs text-red-400">
            {phraseError}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs leading-relaxed text-ink-faint">
            Appare a schermo quando in Moderazione premi «Vai alla schermata finale».
          </p>
          <button
            type="button"
            onClick={() => void savePhrase()}
            disabled={savingPhrase || phraseDraft === null || phraseTooLong}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-black transition disabled:opacity-50"
          >
            {savingPhrase && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/30 border-t-black" />
            )}
            {phraseButtonLabel}
          </button>
        </div>
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

      {/* Eliminazione dei messaggi: volutamente defilato, non un bottone come
          quello sopra. Serve poche volte (es. il pomeriggio del concerto,
          dopo aver testato che tutto funzioni) ed e' irreversibile. */}
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
          {armedPurge
            ? "Tocca di nuovo: elimina per sempre tutti i messaggi salvati"
            : "Elimina tutti i messaggi"}
        </button>
      </div>
    </div>
  );
}
