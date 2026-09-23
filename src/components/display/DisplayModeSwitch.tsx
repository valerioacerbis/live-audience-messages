"use client";

import { useState } from "react";

import { DemoStage } from "./DemoStage";
import { DisplayStage } from "./DisplayStage";

/**
 * Display vero o modalita' demo, con un interruttore in basso a sinistra.
 *
 * Il passaggio avviene DENTRO la pagina, non con un link a `/display?demo=1`:
 * una navigazione dovrebbe riscaricare la pagina proprio quando il sito
 * potrebbe non rispondere (e uscirebbe dal fullscreen). Qui la demo e' gia'
 * nel bundle, importata staticamente accanto al display vero, quindi il clic
 * funziona anche con la rete staccata.
 *
 * Un secondo clic torna al display vero: rimonta lo stream, riparte dalla
 * cache locale e si risincronizza da solo col server.
 */
export function DisplayModeSwitch({
  initialDemo,
  rendererName,
}: {
  initialDemo: boolean;
  rendererName?: string;
}) {
  const [demo, setDemo] = useState(initialDemo);

  const toggle = () => {
    const next = !demo;
    setDemo(next);
    // Solo per coerenza dell'URL (un ricaricamento resta nella modalita'
    // scelta): non e' una navigazione, non parte nessuna richiesta.
    try {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("demo", "1");
      else url.searchParams.delete("demo");
      window.history.replaceState(null, "", url);
    } catch {
      // L'URL e' una comodita': la modalita' e' gia' cambiata.
    }
  };

  return (
    <>
      {demo ? <DemoStage rendererName={rendererName} /> : <DisplayStage rendererName={rendererName} />}

      {/*
        Fuori dalla scena (che nasconde il puntatore) e sopra di essa: passandoci
        sopra col mouse il cursore ricompare, cosi' lo si trova anche al buio.
        L'area cliccabile e' molto piu' grande dell'icona, che invece resta
        quasi invisibile al pubblico. Sta fuori anche dalla schermata di
        chiusura, cosi' e' raggiungibile in ogni momento.
      */}
      <button
        type="button"
        onClick={toggle}
        aria-label={demo ? "Torna al display vero" : "Passa alla modalità demo"}
        title={demo ? "Torna al display vero" : "Passa alla modalità demo"}
        className="fixed bottom-8 left-2 z-10 grid size-10 place-items-center opacity-30 transition-opacity hover:opacity-80"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-3 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 5h10l-2.5-2.5M14 11H4l2.5 2.5" />
        </svg>
      </button>
    </>
  );
}
