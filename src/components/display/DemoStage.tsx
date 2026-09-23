"use client";

import { useDemoEngine } from "@/lib/display/useDemoEngine";
import { DisplayScene } from "./DisplayScene";

/**
 * Il display in modalita' demo (`/display?demo=1`, e il file HTML offline).
 *
 * Solo le frasi pre-scritte, a rotazione, senza nessuna richiesta di rete:
 * e' la finestra di riserva per quando il display vero non risponde. Da qui
 * non deve essere importato niente che parli col server — c'e' un test che
 * lo controlla (`tests/unit/demo.test.ts`).
 */
export function DemoStage({ rendererName }: { rendererName?: string }) {
  const state = useDemoEngine();
  return <DisplayScene state={state} status="demo" rendererName={rendererName} />;
}
