import type { DisplayPhase } from "@/lib/display/engine";
import type { PublicMessage } from "@/lib/domain/types";

/**
 * Contratto tra il motore del display e il renderer visuale.
 *
 * E' la cerniera dell'intero progetto: allo STEP 2 il `NetworkRenderer` con
 * WebGL prendera' il posto del `BasicRenderer` implementando queste stesse
 * props, senza che backend, realtime e motore vengano toccati.
 */
export interface RendererProps {
  /** Il messaggio in scena adesso. */
  current: PublicMessage | null;

  /**
   * TUTTI i messaggi della serata, in ordine.
   *
   * Il renderer base lo ignora. Serve allo STEP 2: la "rete viva" non mostra
   * un messaggio, mostra l'insieme accumulato di tutti — ogni messaggio e' un
   * nodo che resta. Esporlo adesso costa una prop; accorgersi dopo che il
   * motore non ce l'ha costa una riscrittura.
   */
  all: readonly PublicMessage[];

  phase: DisplayPhase;

  /**
   * Il messaggio in scena e' una ripetizione dalla rotazione, non un arrivo
   * nuovo. Il renderer base non fa differenza; allo STEP 2 servira' a dare
   * piu' risalto ai nodi che nascono rispetto a quelli che si riaccendono.
   */
  isReplay: boolean;

  stats: {
    received: number;
    displayed: number;
    queueDepth: number;
  };
}

export type Renderer = (props: RendererProps) => React.ReactNode;
