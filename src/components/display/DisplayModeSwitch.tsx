"use client";

import { useEffect, useState } from "react";

import { publicConfig } from "@/lib/config.public";
import { isToggleKey } from "@/lib/display/demoToggleKey";
import { DemoStage } from "./DemoStage";
import { DisplayStage } from "./DisplayStage";

/**
 * Display vero o modalita' demo, scambiati con un tasto
 * (`publicConfig.display.demoToggleKey`, default X).
 *
 * Tastiera e non un'icona: sul display il puntatore e' nascosto e al buio
 * non si trova. Il passaggio avviene DENTRO la pagina, non con un link a
 * `/display?demo=1`: una navigazione dovrebbe riscaricare la pagina proprio
 * quando il sito potrebbe non rispondere (e uscirebbe dal fullscreen). Qui la
 * demo e' gia' nel bundle, importata staticamente accanto al display vero,
 * quindi il tasto funziona anche con la rete staccata.
 *
 * Premerlo di nuovo torna al display vero: rimonta lo stream, riparte dalla
 * cache locale e si risincronizza da solo col server. Il listener sta qui,
 * sopra la scena, cosi' funziona anche a schermata di chiusura in onda.
 */
export function DisplayModeSwitch({
  initialDemo,
  rendererName,
}: {
  initialDemo: boolean;
  rendererName?: string;
}) {
  const [demo, setDemo] = useState(initialDemo);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isToggleKey(event, publicConfig.display.demoToggleKey)) return;
      event.preventDefault();
      setDemo((current) => {
        const next = !current;
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
        return next;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return demo ? <DemoStage rendererName={rendererName} /> : <DisplayStage rendererName={rendererName} />;
}
