/**
 * Frasi pre-scritte per riempire la rotazione del maxischermo quando il
 * pubblico scrive poco.
 *
 * Sono promesse in prima persona, a tema con il copy pubblico ("La tua
 * promessa e' nello specchio", durante "Man in the Mirror"): non hanno
 * bisogno di essere valutate per qualita' o contenuto, solo di apparire con
 * un'etichetta (nella coda di moderazione, mai a schermo) che le distingua
 * da quelle scritte davvero dal pubblico.
 *
 * Deliberatamente variate nell'attacco e nel ritmo — non tutte "Prometto
 * di...", nessuna riconoscibile come stampino — e con un nome proprio su
 * circa meta' di esse, esattamente come il campo "nome" del form pubblico
 * (facoltativo: molti lo lasciano vuoto). L'obiettivo e' che il pubblico non
 * le distingua da una dedica vera guardando lo schermo.
 *
 * Deliberatamente entro il limite di caratteri del form pubblico
 * (`publicConfig.limits.messageMaxLength`), cosi' non serve alcun controllo
 * aggiuntivo prima di inserirle.
 */

export interface SyntheticPhrase {
  body: string;
  name: string | null;
}

export const SYNTHETIC_PHRASES: readonly SyntheticPhrase[] = [
  { body: "Da stasera ascolto di più e parlo di meno.", name: "Marco" },
  { body: "Ho deciso: perdono chi mi ha ferito, senza aspettare scuse.", name: null },
  { body: "Voglio guardarmi allo specchio senza girare lo sguardo.", name: "Giulia" },
  { body: "Basta rimandare le scuse che devo da troppo tempo.", name: null },
  { body: "Da oggi provo a essere più gentile, anche quando è difficile.", name: "Sara" },
  { body: "Non voglio più confrontarmi con chi non sono io.", name: null },
  {
    body: "È il momento di credere in me stesso, senza aspettare conferme da nessuno.",
    name: null,
  },
  { body: "Chiamo più spesso le persone che amo, non solo quando serve.", name: "Luca" },
  { body: "Smetto di aspettare il momento giusto per essere felice.", name: null },
  { body: "Stasera scelgo la gentilezza, anche quando costa fatica.", name: "Chiara" },
  { body: "Non lascio più andare via chi amo senza un abbraccio.", name: null },
  { body: "Voglio imparare a chiedere scusa senza sentirmi sconfitto.", name: null },
  { body: "Dedico più tempo a chi mi ha sempre dedicato il suo.", name: "Andrea" },
  { body: "Oggi smetto di rimandare i sogni per paura.", name: null },
  { body: "Voglio essere onesto con me stesso prima che con gli altri.", name: "Elena" },
  { body: "Ricomincio a farmi le domande difficili, anche quelle scomode.", name: null },
  { body: "Non spengo più la voce che mi chiede di cambiare.", name: null },
  { body: "Da stasera sono meno duro con chi sbaglia, incluso io.", name: "Davide" },
  { body: "Torno a sorridere anche nei giorni storti.", name: null },
  { body: "Ringrazio chi ha creduto in me quando io non ci credevo.", name: "Francesca" },
  { body: "Scelgo di essere lo specchio in cui gli altri si riconoscono.", name: null },
  { body: "Il cambiamento parte da qui, da stasera.", name: "Matteo" },
  { body: "Perché aspettare ancora per dire quello che provo davvero?", name: null },
  { body: "Meno rancore, più leggerezza: è la promessa di stasera.", name: "Martina" },
  { body: "Ho smesso di fingere di stare bene quando non è vero.", name: null },
  { body: "Voglio essere presente per davvero, non solo con il corpo.", name: "Simone" },
  { body: "Basta paragonarmi agli altri: mi guardo e mi basto.", name: null },
  { body: "Da oggi dico più spesso «ti voglio bene», senza vergogna.", name: "Valentina" },
  { body: "Ho imparato che cambiare si può, si deve solo iniziare.", name: null },
  { body: "Meno giudizio, più ascolto: parto da me stasera.", name: "Riccardo" },
  { body: "Voglio lasciar andare i pesi che porto da troppo tempo.", name: null },
  {
    body: "Oggi scelgo di essere gentile con la persona che sono stato ieri.",
    name: "Ilaria",
  },
  { body: "Da stasera provo a non rimandare più i «ti amo».", name: null },
  { body: "Voglio essere per gli altri quello che non ho avuto io.", name: "Federico" },
  { body: "Basta scuse a metà: stasera dico quello che penso davvero.", name: null },
  { body: "Ho deciso di fidarmi di più, anche quando fa paura.", name: "Alessia" },
  { body: "Meno paura di sbagliare, più coraggio di provarci.", name: null },
  { body: "Da oggi smetto di aspettare che siano gli altri a cambiare.", name: "Giorgio" },
  { body: "Voglio tornare a fidarmi di me, come facevo da bambino.", name: null },
  { body: "Stasera scelgo di essere più leggero con me stesso.", name: "Laura" },
];

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Pesca fino a `count` frasi mai usate finora (per testo). Niente
 * ripescaggio dal pool: una volta esaurite, restituisce meno frasi di
 * quante richieste (anche zero) invece di ripetere una frase gia' vista dal
 * pubblico — il pulsante in `/admin` si disabilita da solo a quel punto
 * (vedi `countAvailablePhrases`).
 */
export function pickSyntheticPhrases(
  usedBodies: readonly string[],
  count: number,
  rng: () => number = Math.random,
): SyntheticPhrase[] {
  if (SYNTHETIC_PHRASES.length === 0 || count <= 0) return [];

  const used = new Set(usedBodies);
  const unused = shuffle(SYNTHETIC_PHRASES.filter((p) => !used.has(p.body)), rng);
  return unused.slice(0, count);
}

/** Quante frasi del pool non sono ancora state usate per questo evento. */
export function countAvailablePhrases(usedBodies: readonly string[]): number {
  const used = new Set(usedBodies);
  return SYNTHETIC_PHRASES.filter((p) => !used.has(p.body)).length;
}
