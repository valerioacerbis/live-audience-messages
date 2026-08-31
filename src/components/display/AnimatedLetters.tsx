"use client";

import { motion } from "motion/react";

import { publicConfig } from "@/lib/config.public";
import type { DisplayPhase } from "@/lib/display/engine";
import { splitGraphemes } from "@/lib/display/graphemes";
import { letterDelayMs } from "@/lib/display/letterStagger";

/**
 * Tempi dell'animazione lettera per lettera. Sono una scelta estetica, non
 * un parametro operativo che l'operatore deve poter toccare la sera
 * dell'evento (a differenza di `enterMs`/`exitMs` in config.public.ts, che
 * governano la state machine e restano li'): per questo stanno nel codice
 * invece che in `.env`.
 *
 * Solo l'ingresso e' lettera per lettera: il motore resta in "holding" con
 * lo stesso stato visivo dopo `enterMs`, quindi l'ingresso puo' richiedere
 * quanto serve senza essere tagliato. L'uscita e' un semplice dissolvenza
 * sull'intero blocco (vedi il componente): niente stagger da vincolare a
 * `exitMs`.
 */
const LETTER_ENTER_MS = 1100;
const LETTER_ENTER_STAGGER_MS = 450;

// Simmetrica (lenta-veloce-lenta), non in sola decelerazione: senza uno
// scatto iniziale il passaggio tra una lettera e la successiva si fonde
// invece di "saltare" da una all'altra.
const ENTER_EASE = [0.4, 0, 0.2, 1] as const;
const EXIT_EASE = [0.7, 0, 0.84, 0] as const;

// Solo dissolvenza e blur: nessuna traslazione, le lettere non si muovono.
const HIDDEN = { opacity: 0, filter: "blur(14px)" };
const VISIBLE = { opacity: 1, filter: "blur(0px)" };

interface AnimatedLettersProps {
  text: string;
  phase: DisplayPhase;
  className?: string;
}

/**
 * Fa entrare un testo lettera per lettera, con blur, invece che come blocco
 * unico. Le parole restano indivise (ogni parola e' un inline-block), cosi'
 * l'andare a capo resta quello naturale del browser: solo le lettere dentro
 * ogni parola si spezzano in nodi animati.
 *
 * L'uscita e' volutamente diversa: un semplice dissolvenza sull'intero
 * blocco, non lettera per lettera — l'effetto "a onda" serve per l'arrivo,
 * non per la sparizione.
 */
export function AnimatedLetters({ text, phase, className }: AnimatedLettersProps) {
  const words = text.split(/(\s+)/);
  const wordLetterCounts = words.map((word) => (/^\s+$/.test(word) ? 0 : splitGraphemes(word).length));
  const totalLetters = wordLetterCounts.reduce((sum, count) => sum + count, 0);
  // Indice globale della prima lettera di ogni parola, calcolato in anticipo
  // cosi' la mappa qui sotto non deve mutare un contatore condiviso tra le
  // callback che generano il JSX.
  const wordStartIndexes = wordLetterCounts.reduce<number[]>((starts, count, i) => {
    starts.push(i === 0 ? 0 : starts[i - 1]! + wordLetterCounts[i - 1]!);
    return starts;
  }, []);

  const isExiting = phase === "exiting";

  return (
    <motion.span
      className={className}
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: publicConfig.display.exitMs / 1000, ease: EXIT_EASE }}
    >
      {words.map((word, wordIndex) => {
        if (/^\s+$/.test(word)) {
          return <span key={wordIndex}>{word}</span>;
        }

        const startIndex = wordStartIndexes[wordIndex]!;

        return (
          <span key={wordIndex} className="inline-block whitespace-nowrap">
            {splitGraphemes(word).map((letter, letterIndex) => {
              const globalIndex = startIndex + letterIndex;
              const delaySeconds =
                letterDelayMs(globalIndex, totalLetters, LETTER_ENTER_STAGGER_MS) / 1000;

              return (
                <motion.span
                  key={letterIndex}
                  className="inline-block"
                  initial={HIDDEN}
                  animate={VISIBLE}
                  transition={{ duration: LETTER_ENTER_MS / 1000, delay: delaySeconds, ease: ENTER_EASE }}
                >
                  {letter}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </motion.span>
  );
}
