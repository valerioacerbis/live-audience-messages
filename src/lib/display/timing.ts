import { publicConfig } from "../config.public";

const { display } = publicConfig;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Quanto resta a schermo un messaggio.
 *
 * Due forze opposte:
 * - un messaggio lungo va letto, quindi resta di piu';
 * - una coda che si allunga significa che il display sta andando indietro
 *   rispetto al pubblico, e mostrare alle 23:10 un messaggio delle 22:40 e'
 *   peggio che mostrarlo per meno tempo.
 *
 * Quindi il tempo di lettura viene compresso verso il minimo man mano che la
 * coda cresce, in modo continuo: nessuno scatto percepibile a schermo.
 */
export function holdDurationMs(bodyLength: number, queueDepth: number): number {
  const readingTime = clamp(
    display.holdBaseMs + bodyLength * display.holdPerCharMs,
    display.holdMinMs,
    display.holdMaxMs,
  );

  const span = Math.max(1, display.burstSaturation - display.burstThreshold);
  const pressure = clamp((queueDepth - display.burstThreshold) / span, 0, 1);

  return Math.round(readingTime + (display.holdMinMs - readingTime) * pressure);
}

/** Stima di quanto ci vuole a smaltire la coda: la mostro all'operatore. */
export function estimatedDrainMs(queueDepth: number, avgBodyLength = 80): number {
  if (queueDepth === 0) return 0;
  const perMessage =
    display.enterMs + holdDurationMs(avgBodyLength, queueDepth) + display.exitMs;
  return perMessage * queueDepth;
}
