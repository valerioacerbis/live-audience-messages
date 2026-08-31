"use client";

import { motion } from "motion/react";

import { publicConfig } from "@/lib/config.public";
import { holdDurationMs } from "@/lib/display/timing";
import { AnimatedLetters } from "../AnimatedLetters";
import type { RendererProps } from "./types";

// Zoom minimo e continuo per tutta la permanenza a schermo: parte insieme
// all'ingresso delle lettere ma non finisce con loro (le lettere completano
// la propria animazione ben prima) — continua a ritmo costante finche' non
// e' pronta a uscire la frase corrente. Ad ogni nuovo messaggio riparte
// sempre dalla stessa posizione iniziale grazie al remount via key.
const ZOOM_SCALE = 1.1;

/**
 * Renderer dello STEP 1.
 *
 * Minimale ma non "pagina web": nero pieno, tipografia grande, un solo
 * messaggio alla volta. Deve sembrare il primo elemento di un'esperienza
 * audiovisiva, non una bacheca.
 */
export function BasicRenderer({ current, phase, stats }: RendererProps) {
  if (!current) return null;

  const onScreenMs =
    publicConfig.display.enterMs + holdDurationMs(current.body.length, stats.queueDepth);

  return (
    <motion.div
      // La key rimonta il nodo a ogni messaggio: e' cio' che fa ripartire
      // l'animazione di ingresso e lo zoom senza orchestrare nulla a mano.
      key={current.id}
      className="flex max-w-[85vw] flex-col items-center gap-10 text-center"
      initial={{ scale: 1 }}
      animate={{ scale: ZOOM_SCALE }}
      transition={{ duration: onScreenMs / 1000, ease: "linear" }}
    >
      <p className="text-[clamp(2.5rem,5.5vw,7rem)] font-semibold leading-[1.15] tracking-tight text-balance text-ink">
        <AnimatedLetters text={current.body} phase={phase} />
      </p>

      {current.name && (
        <p className="text-[clamp(1.25rem,2vw,2.5rem)] font-light text-ink-dim">
          <AnimatedLetters text={current.name} phase={phase} />
        </p>
      )}
    </motion.div>
  );
}
