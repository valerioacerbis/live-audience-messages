"use client";

import { useEffect, useRef, useState } from "react";

import { publicConfig } from "@/lib/config.public";
import { countGraphemes } from "@/lib/domain/sanitize";

/**
 * Form del pubblico.
 *
 * Vincoli che ne hanno determinato la forma:
 * - deve richiedere pochi secondi, al buio, con una mano sola;
 * - la rete del locale puo' essere pessima, quindi ogni invio e' idempotente
 *   e riprovabile senza rischio di doppioni sul maxischermo;
 * - nessun login, nessun account, nessuna app.
 */

const SESSION_KEY = "lam:session";
const { limits, event } = publicConfig;

function getSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // Navigazione privata o storage bloccato: identita' valida per questa
    // sola visita. Il rate limit per IP copre comunque il caso.
    return crypto.randomUUID();
  }
}

type Phase = "writing" | "sending" | "sent" | "error";

export function MessageForm() {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("writing");
  /** Honeypot: resta vuoto per un umano, un bot lo compila. */
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** Impostato al mount: `Date.now()` durante il render non e' puro. */
  const openedAt = useRef(0);
  const sessionId = useRef<string>("");
  /**
   * La chiave di idempotenza resta la stessa per tutti i tentativi dello
   * stesso messaggio: e' cio' che permette di riprovare su una rete che
   * perde le risposte senza far comparire il messaggio due volte.
   */
  const clientMsgId = useRef<string>("");

  useEffect(() => {
    openedAt.current = Date.now();
    sessionId.current = getSessionId();
    clientMsgId.current = crypto.randomUUID();
  }, []);

  const used = countGraphemes(body);
  const remaining = limits.messageMaxLength - used;
  const tooLong = remaining < 0;
  const canSend = body.trim().length > 0 && !tooLong && phase !== "sending";

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!canSend) return;

    setPhase("sending");
    setError(null);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventSlug: event.slug,
          body,
          name: name.trim() || null,
          clientMsgId: clientMsgId.current,
          sessionId: sessionId.current,
          elapsedMs: Date.now() - openedAt.current,
          hp: honeypot,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? "Non e' riuscito. Riprova tra un attimo.");
        setPhase("error");
        return;
      }

      setPhase("sent");
    } catch {
      setError("Connessione assente. Riprova tra un attimo.");
      setPhase("error");
    }
  }

  function writeAnother() {
    setBody("");
    // Il nome resta: e' sempre la stessa persona, non glielo richiediamo.
    setPhase("writing");
    setError(null);
    openedAt.current = Date.now();
    clientMsgId.current = crypto.randomUUID();
  }

  if (phase === "sent") {
    return (
      <div className="animate-enter flex flex-col items-center gap-6 py-12 text-center">
        <div className="grid size-20 place-items-center rounded-full border border-accent/40 bg-accent/10">
          <svg viewBox="0 0 24 24" className="size-9 stroke-accent" fill="none" strokeWidth={2.5}>
            <path d="M4 12.5 9.5 18 20 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="text-2xl font-semibold">Messaggio inviato</p>
          <p className="text-balance text-ink-dim">
            Tieni d&apos;occhio il maxischermo.
          </p>
        </div>
        <button
          type="button"
          onClick={writeAnother}
          className="rounded-full border border-line px-6 py-3 text-sm font-medium text-ink-dim transition hover:border-ink-faint hover:text-ink active:scale-98"
        >
          Scrivine un altro
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          autoFocus
          enterKeyHint="done"
          placeholder="Scrivi qui la tua dedica..."
          aria-label="Il tuo messaggio"
          className="w-full resize-none rounded-2xl border border-line bg-surface-raised px-4 py-4 text-lg leading-relaxed text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/60"
        />
        <div className="flex justify-end">
          <span
            className={`text-sm tabular-nums ${tooLong ? "text-red-400" : "text-ink-faint"}`}
            aria-live="polite"
          >
            {used} / {limits.messageMaxLength}
          </span>
        </div>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={limits.nameMaxLength}
        placeholder="Il tuo nome (facoltativo)"
        aria-label="Il tuo nome, facoltativo"
        className="w-full rounded-2xl border border-line bg-surface-raised px-4 py-3.5 text-base text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/60"
      />

      {/*
        Honeypot: invisibile a un umano, irresistibile per un bot semplice.
        Se arriva compilato il server risponde 200 come sempre, senza salvare
        nulla: al bot non diciamo mai che l'abbiamo riconosciuto.
      */}
      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] size-0 opacity-0"
      />

      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSend}
        className="rounded-2xl bg-accent px-6 py-4 text-lg font-semibold text-black transition active:scale-98 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint"
      >
        {phase === "sending" ? "Invio..." : "Invia"}
      </button>

      <p className="text-center text-xs text-ink-faint">
        Il messaggio potrebbe essere letto da un moderatore prima di comparire.
      </p>
    </form>
  );
}
