/**
 * Punto d'ingresso del file HTML offline (vedi `build-offline-demo.ts`).
 *
 * Monta esattamente gli stessi componenti di `/display?demo=1`, fuori da
 * Next: la pagina deve funzionare aperta dal disco, con la rete staccata.
 */

import { createRoot } from "react-dom/client";

import { DemoStage } from "@/components/display/DemoStage";
import { FullscreenGate } from "@/components/display/DisplayScene";

createRoot(document.getElementById("root")!).render(
  <FullscreenGate demo>
    <DemoStage />
  </FullscreenGate>,
);
