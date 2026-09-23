import { SYNTHETIC_PHRASES } from "./syntheticPhrases";
import type { PublicMessage } from "./types";

/**
 * Feed della modalita' demo di `/display` (`?demo=1`) e del file HTML offline.
 *
 * E' il paracadute per quando il sito vero non risponde: le frasi
 * pre-scritte, gia' pronte nel codice della pagina, date al motore del
 * display come se fossero arrivate dal server. Nessun database, nessuna API,
 * nessuna moderazione: una volta caricata la pagina, gira anche senza rete.
 *
 * Gli id hanno un prefisso proprio, cosi' non possono mai confondersi con
 * quelli veri (uuid dal database). I timestamp sono fissi e crescenti solo
 * per dare al motore l'ordine di ingresso: in demo nessuno li legge come ora.
 */
const DEMO_EPOCH = Date.UTC(2026, 0, 1);

export function demoMessages(): PublicMessage[] {
  return SYNTHETIC_PHRASES.map((phrase, index) => {
    const at = new Date(DEMO_EPOCH + index * 1000).toISOString();
    return {
      id: `demo-${index}`,
      body: phrase.body,
      name: phrase.name,
      createdAt: at,
      releasedAt: at,
    };
  });
}
