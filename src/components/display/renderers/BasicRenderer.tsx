"use client";

import { motion } from "motion/react";

import { publicConfig } from "@/lib/config.public";
import { holdDurationMs } from "@/lib/display/timing";
import { AnimatedLetters, LETTER_ENTRANCE_TOTAL_MS } from "../AnimatedLetters";
import type { RendererProps } from "./types";

// Zoom minimo e continuo per tutta la permanenza a schermo: parte insieme
// all'ingresso delle lettere ma non finisce con loro (le lettere completano
// la propria animazione ben prima) — continua a ritmo costante finche' non
// e' pronta a uscire la frase corrente. Ad ogni nuovo messaggio riparte
// sempre dalla stessa posizione iniziale grazie al remount via key.
const ZOOM_SCALE = 1.15;

// Il nome non fa il lettering della frase: e' un semplice fade-in con
// risalita dal basso, e compare solo a frase gia' scritta (da qui il
// ritardo su LETTER_ENTRANCE_TOTAL_MS).
const NAME_FADE_MS = 700;
const NAME_RISE_DISTANCE = "0.6em";
const NAME_ENTER_EASE = [0.22, 1, 0.36, 1] as const;
const NAME_EXIT_EASE = [0.7, 0, 0.84, 0] as const;

/**
 * Renderer dello STEP 1.
 *
 * Minimale ma non "pagina web": nero pieno, tipografia grande, un solo
 * messaggio alla volta. Deve sembrare il primo elemento di un'esperienza
 * audiovisiva, non una bacheca.
 */
export function BasicRenderer({ current, phase, stats }: RendererProps) {
  if (!current) return null;

  const isExiting = phase === "exiting";
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
        <motion.p
          className="text-[clamp(1.25rem,2vw,2.5rem)] font-light text-ink-dim"
          initial={{ opacity: 0, y: NAME_RISE_DISTANCE }}
          animate={isExiting ? { opacity: 0, y: "0em" } : { opacity: 1, y: "0em" }}
          transition={
            isExiting
              ? { duration: publicConfig.display.exitMs / 1000, ease: NAME_EXIT_EASE }
              : {
                  duration: NAME_FADE_MS / 1000,
                  delay: LETTER_ENTRANCE_TOTAL_MS / 1000,
                  ease: NAME_ENTER_EASE,
                }
          }
        >
          {current.name}
        </motion.p>
      )}
    </motion.div>
  );
}
