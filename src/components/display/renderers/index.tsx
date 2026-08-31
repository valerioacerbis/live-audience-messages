import { BasicRenderer } from "./BasicRenderer";
import type { RendererProps } from "./types";

/**
 * Dispatcher dei renderer.
 *
 * Uno `switch` invece di una mappa nome->componente: il compilatore di React
 * non permette di costruire un componente durante il render, e comunque cosi'
 * si legge meglio. Allo STEP 2 si aggiunge un `case` e nient'altro.
 *
 * Selezionabile da query string (`/display?renderer=basic`), utile per
 * confrontare i renderer durante il soundcheck e tornare a quello base con un
 * tasto se il WebGL fa i capricci sul portatile del service.
 */
export function MessageRenderer({
  name,
  ...props
}: RendererProps & { name?: string | undefined }) {
  switch (name) {
    // case "network":
    //   return <NetworkRenderer {...props} />;   // ← STEP 2
    case "basic":
    default:
      return <BasicRenderer {...props} />;
  }
}

export type { RendererProps } from "./types";
