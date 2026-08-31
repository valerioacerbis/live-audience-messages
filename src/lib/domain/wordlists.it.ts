/**
 * Liste italiane per il filtro automatico.
 *
 * La distinzione tra i due livelli e' una scelta di prodotto, non tecnica.
 * A un concerto rock "che cazzo di serata!" e' entusiasmo, non un problema:
 * bloccarlo a priori significa rifiutare messaggi genuini e far sembrare il
 * sistema rotto. Le slur invece non hanno un contesto in cui vanno bene.
 *
 * - BLOCKED : rifiutato subito, non arriva nemmeno in coda all'operatore.
 * - SUSPECT : richiede un occhio umano. Se nessuno modera, non va mai a schermo.
 *
 * Le liste sono deliberatamente corte e ad alta precisione: una lista lunga e
 * aggressiva produce falsi positivi, e ogni falso positivo e' una persona che
 * ha scritto qualcosa di bello e non lo vede mai comparire.
 *
 * NOTA IMPORTANTE (vedi `collapseRuns` in moderation.ts): i transformer di
 * `obscenity` collassano le lettere ripetute, quindi il testo "cazzo" viene
 * confrontato come "cazo". Le parole qui sotto sono scritte in italiano
 * normale e collassate a runtime: cosi' la lista resta leggibile e i pattern
 * restano corretti. Un test verifica che ogni voce reagisca davvero alla sua
 * grafia naturale, perche' questo e' esattamente il tipo di errore che passa
 * inosservato fino alla serata del concerto.
 */

/** Parole singole che non passano in nessun caso. */
export const IT_BLOCKED_WORDS: readonly string[] = [
  // slur etnico-razziali
  "negro",
  "negri",
  "negra",
  "zingaraccia",
  "terrone",
  "terroni",
  // slur omotransfobiche
  "frocio",
  "froci",
  "ricchione",
  "ricchioni",
  "travione",
  // misoginia esplicita
  "troia",
  "troie",
  "puttana",
  "puttane",
  "zoccola",
  "mignotta",
  // sessuale esplicito
  "pompino",
  "inculare",
  "sborra",
  "sborrata",
];

/**
 * Frasi che non passano.
 *
 * Sono regex normali, non pattern di `obscenity`: i suoi transformer eliminano
 * gli spazi, e un pattern multi-parola non riesce piu' ad agganciare i confini
 * di parola. Meglio uno strumento semplice che funziona.
 */
export const IT_BLOCKED_PHRASES: ReadonlyArray<{ test: RegExp; reason: string }> = [
  { test: /\b(?:ti|vi|te)\s+ammazz\w*/iu, reason: "minaccia" },
  { test: /\bti\s+(?:uccido|sfondo|spacco)\b/iu, reason: "minaccia" },
  { test: /\bmorte\s+a(?:i|gli|lle)\s+\w+/iu, reason: "istigazione" },
  { test: /\bfinocchio\s+di\s+merda\b/iu, reason: "linguaggio offensivo" },
];

/** Volgarita' comune: va vista da un umano, non rifiutata a priori. */
export const IT_SUSPECT_WORDS: readonly string[] = [
  "cazzo",
  "cazzi",
  "cazzata",
  "cazzate",
  "stronzo",
  "stronzi",
  "stronzate",
  "merda",
  "coglione",
  "coglioni",
  "vaffanculo",
  "fanculo",
  "culo",
  "figa",
  "bastardo",
  "bastardi",
  "tette",
  // "scopare" vuol dire anche spazzare: sospetto, non bloccato.
  "scopare",
];

export const IT_SUSPECT_PHRASES: ReadonlyArray<{ test: RegExp; reason: string }> = [
  { test: /\bdio\s*(?:cane|porco|maiale|bestia|ladro)\b/iu, reason: "bestemmia" },
  { test: /\bporco\s+(?:dio|giuda)\b/iu, reason: "bestemmia" },
  { test: /\bmadonna\s+(?:puttana|troia|maiala)\b/iu, reason: "bestemmia" },
];

/**
 * Termini che il dataset inglese di `obscenity` segnala ma che in italiano
 * sono innocui o comunissimi. Senza queste eccezioni il filtro rifiuterebbe
 * messaggi del tutto normali: "analisi" contiene "anal", ed e' il classico
 * Scunthorpe problem.
 */
export const IT_WHITELIST: readonly string[] = [
  "analisi",
  "analitico",
  "canale",
  "penisola",
  "arsenale",
  "bassano",
  "cocco",
  "cocktail",
  "spesso",
  "titolo",
  "sassone",
];
