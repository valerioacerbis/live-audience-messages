"use client";

import { useEffect, useReducer } from "react";

import { demoMessages } from "../domain/demoFeed";
import { displayReducer, initialDisplayState, type DisplayState } from "./engine";
import { useDisplayClock } from "./useDisplayClock";

/**
 * Motore del display in modalita' demo.
 *
 * Stesso reducer e stesso orologio del display vero, ma i messaggi arrivano
 * dal codice invece che dalla rete. Deliberatamente NON riusa
 * `useDisplayEngine`: niente stream, niente telemetria, niente cache in
 * localStorage (le frasi demo non devono finire nella cache del display vero
 * aperto nello stesso browser). Un test verifica che da qui non parta
 * nessuna richiesta di rete.
 */
export function useDemoEngine(): DisplayState {
  const [state, dispatch] = useReducer(displayReducer, undefined, initialDisplayState);

  // Le frasi entrano direttamente nella rotazione, non nella coda dei nuovi:
  // 40 arrivi insieme sarebbero letti come un'ondata e il motore
  // accorcerebbe ogni frase al tempo minimo. `restoreCache` fa esattamente
  // questo (storico pieno, coda vuota) e, senza nessun ingest dal server che
  // lo corregga, resta cosi' per tutta la sessione.
  useEffect(() => {
    dispatch({ type: "restoreCache", messages: demoMessages(), now: Date.now() });
  }, []);

  useDisplayClock(dispatch);

  return state;
}
