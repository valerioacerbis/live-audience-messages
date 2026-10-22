"use client";

import { useEffect, useRef, useState } from "react";

import { publicConfig } from "@/lib/config.public";
import { countGraphemes } from "@/lib/domain/sanitize";

import { PromiseSent } from "./PromiseSent";

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
const { limits, event, submitTimeoutMs } = publicConfig;

function getSessionId(): string {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // Navigazione privata o storage bloccato: identita' valida per questa
    // sola visita, quindi il limite per sessione non la segue tra un invio e
    // l'altro. E' un caso raro e il prezzo di sbagliarlo e' basso: preferiamo
    // che questa persona scriva due volte piuttosto che non scriva affatto.
    return crypto.randomUUID();
  }
}

type Phase = "writing" | "sending" | "sent" | "error";

interface MessageFormProps {
  /**
   * Intestazione (logo, nome evento, frase) passata dal Server Component
   * padre: resta renderizzata li', zero JS in piu' per mostrarla. Qui viene
   * solo nascosta quando il messaggio e' stato inviato, cosi' l'attenzione
   * va tutta sulla conferma invece che restare divisa con logo e copy sopra.
   */
  children?: React.ReactNode;
}

export function MessageForm({ children }: MessageFormProps) {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("writing");
  /** Honeypot: resta vuoto per un umano, un bot lo compila. */
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Attesa annunciata dal server prima del prossimo invio. */
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

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
        // Su una cella satura la richiesta puo' restare appesa a lungo, e chi
        // ha scritto resterebbe davanti al pulsante che gira senza poter fare
        // niente. Meglio dichiararla persa e offrire il rinvio: `clientMsgId`
        // non cambia, quindi se in realta' era arrivata non nasce un doppione.
        signal: AbortSignal.timeout(submitTimeoutMs),
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

      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        cooldownSeconds?: number;
      };

      if (!response.ok) {
        setError(data.message ?? "Non è riuscito. Riprova tra un attimo.");
        setPhase("error");
        return;
      }

      // Campo assente (risposta troncata, server vecchio): pulsante subito
      // attivo. Al peggio il server rispondera' "aspetta un attimo".
      setCooldownSeconds(
        typeof data.cooldownSeconds === "number" && data.cooldownSeconds > 0 ? data.cooldownSeconds : 0,
      );
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
    // Niente logo/nome evento/frase qui: quando il messaggio e' partito,
    // l'attenzione deve andare tutta alla conferma, non essere condivisa
    // con l'intestazione della pagina (che il padre passa come children,
    // e che quindi semplicemente non viene renderizzata in questo ramo).
    return <PromiseSent cooldownSeconds={cooldownSeconds} onWriteAnother={writeAnother} />;
  }

  return (
    <>
      {children}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            autoFocus
            enterKeyHint="done"
            placeholder="Es. Da stasera scelgo di essere presente per chi amo davvero."
            aria-label="La tua promessa"
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
          ✨ Potrà ispirare tutta la sala. Potrebbe essere letta da un
          moderatore prima di comparire.
        </p>
      </form>
    </>
  );
}
