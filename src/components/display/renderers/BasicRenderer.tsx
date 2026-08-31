"use client";

import type { RendererProps } from "./types";

/**
 * Renderer dello STEP 1.
 *
 * Minimale ma non "pagina web": nero pieno, tipografia grande, un solo
 * messaggio alla volta. Deve sembrare il primo elemento di un'esperienza
 * audiovisiva, non una bacheca.
 */
export function BasicRenderer({ current, phase }: RendererProps) {
  if (!current) return null;

  const animation =
    phase === "exiting" ? "animate-exit" : "animate-enter";

  return (
    <div
      // La key rimonta il nodo a ogni messaggio: e' cio' che fa ripartire
      // l'animazione di ingresso senza orchestrare nulla a mano.
      key={current.id}
      className={`${animation} flex max-w-[85vw] flex-col items-center gap-10 text-center`}
    >
      <p className="text-[clamp(2.5rem,5.5vw,7rem)] font-semibold leading-[1.15] tracking-tight text-balance text-ink">
        {current.body}
      </p>

      {current.name && (
        <p className="text-[clamp(1.25rem,2vw,2.5rem)] font-light text-ink-dim">
          &mdash; {current.name}
        </p>
      )}
    </div>
  );
}
