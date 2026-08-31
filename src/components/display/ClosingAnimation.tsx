"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";

import { AnimatedLetters } from "./AnimatedLetters";

// Quanto resta a schermo ogni parola prima che compaia la successiva.
const WORD_DISPLAY_MS = 900;
const ENTER_MS = 350;
const EXIT_MS = 150;
// Con overshoot, non solo decelerazione: e' lo scatto che rende l'ingresso
// di ogni parola "impattante" invece che un semplice fade.
const ENTER_EASE = [0.34, 1.56, 0.64, 1] as const;
const EXIT_EASE = [0.7, 0, 0.84, 0] as const;

// Una parola sola sullo schermo puo' essere molto piu' grande di tre
// insieme: le tre parole di anticipazione usano una taglia a se',
// nettamente maggiore di quella della frase finale.
const WORD_FONT_SIZE = "clamp(6rem, 18vw, 20rem)";
const FINAL_FONT_SIZE = "clamp(4rem, 9vw, 10rem)";
// Dopo lo scatto d'ingresso, la frase finale continua a crescere piano
// all'infinito (come lo zoom continuo dei messaggi in BasicRenderer.tsx,
// ma molto piu' lento): non e' un rimbalzo, e' un respiro lunghissimo.
const FINAL_ZOOM_SCALE = 1.15;
const FINAL_ZOOM_MS = 14000;

function useReducedMotion(): boolean {
  // Valore iniziale letto in fase di inizializzazione dello stato, non in un
  // effetto: un `setState` sincrono dentro un effetto e' cascading render
  // che il progetto vieta via lint.
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Schermata di chiusura: le parole della frase compaiono una alla volta,
 * grandi e centrate, con un ingresso a scatto. Dopo l'ultima resta scritta
 * la frase intera, ferma: e' l'ultima cosa che il pubblico vede.
 *
 * E' pensata come schermata definitiva della serata, non come un altro
 * stato del loop: chi la vede non deve aspettarsi che torni indietro.
 */
export function ClosingAnimation({ phrase }: { phrase: string }) {
  const reducedMotion = useReducedMotion();
  const words = useMemo(() => phrase.split(" ").filter(Boolean), [phrase]);
  // L'ultimo step e' sempre la frase intera: le parole prima sono solo
  // l'anticipazione, uno alla volta, di quello che resta scritto alla fine.
  const steps = useMemo(() => (reducedMotion ? [phrase] : [...words, phrase]), [words, phrase, reducedMotion]);
  const [stepIndex, setStepIndex] = useState(0);

  // Niente reset di stepIndex qui: il chiamante rimonta il componente (via
  // `key`) ogni volta che vuole far ripartire la sequenza da capo, quindi lo
  // stato iniziale a 0 basta gia'. Un `setState` sincrono in un effetto per
  // "resettare" e' il pattern che il lint del progetto vieta.
  useEffect(() => {
    if (steps.length <= 1) return;

    const timers = steps
      .slice(0, -1)
      .map((_, i) => window.setTimeout(() => setStepIndex(i + 1), WORD_DISPLAY_MS * (i + 1)));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [steps]);

  const current = steps[stepIndex] ?? phrase;
  const isSingleWord = stepIndex < steps.length - 1;

  return (
    <MotionConfig reducedMotion="user">
      <div className="stage relative grid h-dvh w-full place-items-center overflow-hidden bg-stage">
        <AnimatePresence mode="wait">
          {isSingleWord ? (
            <motion.p
              key={stepIndex}
              className="px-[6vw] text-center font-semibold leading-[1.15] tracking-tight text-balance text-ink"
              style={{ fontSize: WORD_FONT_SIZE }}
              initial={{ opacity: 0, scale: 0.6, filter: "blur(10px)" }}
              animate={{
                opacity: 1,
                scale: 1,
                filter: "blur(0px)",
                transition: { duration: ENTER_MS / 1000, ease: ENTER_EASE },
              }}
              exit={{
                opacity: 0,
                scale: 0.94,
                filter: "blur(6px)",
                transition: { duration: EXIT_MS / 1000, ease: EXIT_EASE },
              }}
            >
              {current}
            </motion.p>
          ) : (
            // Stesso ingresso delle frasi del pubblico (AnimatedLetters, lettera
            // per lettera con blur) dentro lo stesso zoom continuo e lentissimo
            // usato in BasicRenderer.tsx: la frase finale entra in scena come
            // l'ultimo messaggio della serata, non come le tre parole prima.
            <motion.div
              key={stepIndex}
              initial={{ scale: 1 }}
              animate={{ scale: FINAL_ZOOM_SCALE }}
              transition={{ duration: FINAL_ZOOM_MS / 1000, ease: "linear" }}
            >
              <p
                className="px-[6vw] text-center font-semibold leading-[1.15] tracking-tight text-balance text-ink"
                style={{ fontSize: FINAL_FONT_SIZE }}
              >
                <AnimatedLetters text={current} phase="entering" />
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
