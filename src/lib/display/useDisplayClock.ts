"use client";

import { useEffect, type Dispatch } from "react";

import type { DisplayAction } from "./engine";

/**
 * Orologio del display: fa avanzare la macchina a stati del motore.
 *
 * Condiviso tra il display vero e la modalita' demo, cosi' i tempi a schermo
 * sono identici nei due casi.
 */
export function useDisplayClock(dispatch: Dispatch<DisplayAction>): void {
  useEffect(() => {
    let frame = 0;
    let last = 0;

    const loop = (time: number) => {
      // ~20 volte al secondo bastano per una macchina a stati con soglie nei
      // decimi di secondo, e lasciano la GPU libera per le animazioni (e per
      // il renderer WebGL dello STEP 2).
      if (time - last >= 50) {
        last = time;
        dispatch({ type: "tick", now: Date.now() });
      }
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [dispatch]);
}
