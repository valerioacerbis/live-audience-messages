"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Schermata di conferma dopo l'invio.
 *
 * L'immagine e' quella di un sasso nell'acqua: la promessa si accende al
 * centro e le onde partono verso l'esterno, mentre qualche scintilla sale
 * come le luci in una sala da concerto. Tutto e' trasformazione e opacita',
 * niente filtri su superfici grandi: deve restare fluido anche su un telefono
 * vecchio con la batteria al 10%.
 *
 * Con `prefers-reduced-motion` la regola globale in globals.css porta ogni
 * animazione al fotogramma finale: resta il testo, fermo e leggibile.
 */

const HEADLINE = "Ogni grande cambiamento comincia così.".split(" ");

/**
 * Scintille fisse, non casuali: `Math.random()` durante il render non e'
 * puro e darebbe un mismatch di idratazione. `dx` e' la deriva laterale.
 */
const EMBERS = [
  { left: 12, dx: 18, size: 3, duration: 7.5, delay: 0.8 },
  { left: 22, dx: -10, size: 2, duration: 9, delay: 2.6 },
  { left: 31, dx: 14, size: 4, duration: 8, delay: 1.4 },
  { left: 40, dx: -16, size: 2, duration: 10, delay: 3.8 },
  { left: 47, dx: 8, size: 3, duration: 7, delay: 0.9 },
  { left: 55, dx: -6, size: 2, duration: 9.5, delay: 2.1 },
  { left: 62, dx: 12, size: 4, duration: 8.5, delay: 4.4 },
  { left: 70, dx: -14, size: 2, duration: 7.8, delay: 1.7 },
  { left: 78, dx: 10, size: 3, duration: 9.2, delay: 3.1 },
  { left: 87, dx: -12, size: 2, duration: 8.2, delay: 1.1 },
];

interface PromiseSentProps {
  /** Secondi prima che il server accetti il prossimo messaggio. */
  cooldownSeconds: number;
  onWriteAnother: () => void;
}

export function PromiseSent({ cooldownSeconds, onWriteAnother }: PromiseSentProps) {
  const [secondsLeft, setSecondsLeft] = useState(cooldownSeconds);
  const deadline = useRef(0);
  const coolingDown = secondsLeft > 0;

  useEffect(() => {
    deadline.current = Date.now() + cooldownSeconds * 1000;
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!coolingDown) return;
    // Il conto si rifa' sull'orologio a ogni tick invece di sottrarre 1:
    // se il telefono va in standby, al risveglio il numero e' gia' giusto.
    const timer = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [coolingDown]);

  return (
    <div className="relative flex min-h-[80dvh] flex-col items-center justify-center gap-10 text-center">
      {/* Bagliore caldo che si apre su tutta la pagina e poi respira. Solo
          opacita' su un livello grande quanto lo schermo: un cerchio enorme
          che si ingrandisce costerebbe troppa memoria a un telefono vecchio. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="animate-promise-bloom absolute inset-0">
          <div className="animate-glow absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgb(249_115_22/0.26)_0%,rgb(249_115_22/0.08)_35%,transparent_65%)]" />
        </div>
        {EMBERS.map((ember, i) => (
          <span
            key={i}
            className="animate-ember absolute bottom-[-2%] rounded-full bg-amber-200 shadow-[0_0_8px_2px_rgb(251_191_36/0.6)]"
            style={
              {
                left: `${ember.left}%`,
                width: ember.size,
                height: ember.size,
                animationDuration: `${ember.duration}s`,
                animationDelay: `${ember.delay}s`,
                "--ember-dx": `${ember.dx}vw`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* La promessa che si accende, e le onde che porta nel mondo. */}
      <div aria-hidden className="relative grid size-28 place-items-center">
        {[0.3, 1.5, 2.7].map((delay) => (
          <span
            key={delay}
            className="animate-ripple absolute inset-0 rounded-full border border-accent/50"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
        <span className="animate-orbit absolute -inset-3">
          <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-amber-200 shadow-[0_0_10px_3px_rgb(251_191_36/0.7)]" />
        </span>
        <div className="animate-ignite relative grid size-24 place-items-center rounded-full bg-[radial-gradient(circle_at_50%_40%,rgb(253_186_116)_0%,rgb(249_115_22)_55%,rgb(194_65_12)_100%)] shadow-[0_0_60px_10px_rgb(249_115_22/0.45)]">
          <svg viewBox="0 0 24 24" className="size-10 stroke-white" fill="none" strokeWidth={2.5}>
            {/* pathLength normalizza il tracciato a 1: la spunta si disegna
                invece di apparire di colpo, qualunque sia la geometria. */}
            <path
              d="M4 12.5 9.5 18 20 7"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-draw-check"
            />
          </svg>
        </div>
      </div>

      <div className="relative space-y-4">
        <p
          className="animate-reveal text-xs font-medium uppercase tracking-[0.3em] text-accent"
          style={{ animationDelay: "0.6s" }}
        >
          Promessa fatta
        </p>
        <h2 className="text-3xl font-semibold tracking-tight text-balance">
          {HEADLINE.map((word, i) => (
            <span
              key={i}
              className="animate-reveal inline-block"
              style={{ animationDelay: `${0.85 + i * 0.12}s` }}
            >
              {word}
              {i < HEADLINE.length - 1 && " "}
            </span>
          ))}
        </h2>
        <p
          className="animate-reveal mx-auto max-w-sm text-balance text-ink-dim"
          style={{ animationDelay: "1.8s" }}
        >
          Presto la leggerà tutta la sala, sul maxischermo, durante Man in the
          Mirror. Ora mantienila: è da qui che il cambiamento comincia.
        </p>
      </div>

      <div className="animate-reveal relative w-full max-w-xs" style={{ animationDelay: "2.3s" }}>
        <button
          type="button"
          onClick={onWriteAnother}
          disabled={coolingDown}
          className="relative w-full overflow-hidden rounded-full border border-line px-6 py-3.5 text-sm font-medium text-ink transition enabled:border-accent/60 enabled:hover:bg-accent/10 active:scale-98 disabled:cursor-not-allowed disabled:text-ink-dim"
        >
          {/* Barra che si riempie in CSS per tutta l'attesa: zero lavoro JS
              per fotogramma, il testo sopra si aggiorna solo una volta al secondo. */}
          {coolingDown && (
            <span
              aria-hidden
              className="animate-cooldown absolute inset-0 origin-left bg-accent/15"
              style={{ animationDuration: `${cooldownSeconds}s` }}
            />
          )}
          <span className="relative tabular-nums">
            {coolingDown
              ? `Puoi farne un'altra tra ${secondsLeft} s`
              : "Fai un'altra promessa"}
          </span>
        </button>
      </div>
    </div>
  );
}
