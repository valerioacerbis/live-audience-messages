"use client";

import { useEffect, useState } from "react";

import { publicConfig } from "@/lib/config.public";

/**
 * Quante frasi sono pronte a girare, sotto "Entra in scena".
 *
 * Prima del click il motore del display non e' ancora montato (e non deve
 * esserlo: consumerebbe la coda dietro la schermata), quindi il numero viene
 * da `/api/health`, riletto finche' questo componente resta a schermo. Se la
 * richiesta fallisce resta l'ultimo valore letto, o niente: e'
 * un'informazione in piu', non una condizione per partire.
 *
 * Sta in un file suo apposta: la schermata d'ingresso e' condivisa con il
 * piano B, che non deve contenere una sola riga di codice di rete (lo
 * controlla `tests/unit/demo.test.ts`). Lo monta solo `/display`.
 */
export function ReadyCount() {
  const [ready, setReady] = useState<{ rotating: number; pending: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: AbortSignal.timeout(publicConfig.display.gateRefreshMs),
        });
        const data = (await response.json()) as {
          rotating?: number;
          stats?: { pending?: number };
        };
        if (!cancelled && typeof data.rotating === "number") {
          setReady({ rotating: data.rotating, pending: data.stats?.pending ?? 0 });
        }
      } catch {
        // Rete o server giu': si tiene l'ultimo numero, si riprova al giro dopo.
      }
    };

    void load();
    const timer = window.setInterval(load, publicConfig.display.gateRefreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!ready) return null;

  return (
    <p className="font-mono text-sm tabular-nums text-ink-dim">
      {ready.rotating} {ready.rotating === 1 ? "frase pronta" : "frasi pronte"}
      {ready.pending > 0 && (
        <span className="text-ink-faint"> · {ready.pending} in moderazione</span>
      )}
    </p>
  );
}
