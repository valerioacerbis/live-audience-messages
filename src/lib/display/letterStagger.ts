/**
 * Ritardo (in ms) prima che la lettera `index` (su `total`) cominci ad
 * animarsi, distribuendo l'onda in modo proporzionale su `budgetMs`.
 *
 * Non e' un passo fisso per lettera: e' l'ultima lettera a dover rispettare
 * il budget, qualunque sia la lunghezza del messaggio (fino al limite
 * configurato in `publicConfig.limits.messageMaxLength`). Cosa rappresenta `budgetMs` e se e' un vincolo duro o solo
 * una scelta estetica dipende dal chiamante (vedi `AnimatedLetters`).
 */
export function letterDelayMs(index: number, total: number, budgetMs: number): number {
  if (total <= 1) return 0;

  return Math.round((index / (total - 1)) * Math.max(0, budgetMs));
}
