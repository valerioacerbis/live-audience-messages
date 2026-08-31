/**
 * Spezza una stringa in grafemi invece che in code unit.
 *
 * Senza questo, un'emoji composta (famiglia, tono di pelle, bandiera) si
 * disintegrerebbe in pezzi separati durante l'animazione lettera per
 * lettera — il tipo di dettaglio che si nota subito su un maxischermo.
 */
export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (entry) => entry.segment);
  }
  return [...text];
}
