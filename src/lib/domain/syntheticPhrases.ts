/**
 * Frasi pre-scritte per riempire la rotazione del maxischermo quando il
 * pubblico scrive poco.
 *
 * Sono promesse in prima persona, a tema con il copy pubblico ("La tua
 * promessa e' nello specchio", durante "Man in the Mirror"): non hanno
 * bisogno di essere valutate per qualita' o contenuto, solo di apparire con
 * un'etichetta che le distingua da quelle scritte davvero dal pubblico.
 *
 * Deliberatamente entro il limite di caratteri del form pubblico
 * (`publicConfig.limits.messageMaxLength`), cosi' non serve alcun controllo
 * aggiuntivo prima di inserirle.
 */

export const SYNTHETIC_PHRASES: readonly string[] = [
  "Prometto di ascoltare di più e parlare di meno.",
  "Da stasera provo a perdonare chi mi ha ferito.",
  "Voglio guardarmi allo specchio senza girare lo sguardo.",
  "Prometto di essere più gentile con chi mi sta vicino ogni giorno.",
  "Oggi scelgo di cambiare io, prima di chiedere agli altri di farlo.",
  "Prometto di chiamare più spesso chi amo, non solo quando serve.",
  "Voglio smettere di rimandare le scuse che devo da troppo tempo.",
  "Prometto di essere paziente con chi sta imparando, come ho fatto io.",
  "Da domani provo a dire di più «grazie» e di meno «dovevi».",
  "Prometto di credere di più in me, senza aspettare conferme.",
  "Voglio essere la persona che vorrei incontrare io stesso.",
  "Prometto di lasciare andare i rancori che non mi servono più.",
  "Oggi mi prendo l'impegno di ascoltare senza giudicare subito.",
  "Prometto di dire «ti voglio bene» più spesso, senza vergogna.",
  "Voglio smettere di confrontarmi con chi non sono io.",
  "Prometto di essere presente, non solo fisicamente, con chi amo.",
  "Da stasera scelgo la gentilezza anche quando costa fatica.",
  "Prometto di non lasciare le persone che amo senza un abbraccio.",
  "Voglio imparare a chiedere scusa senza sentirmi sconfitto.",
  "Prometto di dedicare tempo a chi mi ha sempre dedicato il suo.",
  "Oggi decido di smettere di rimandare i sogni per paura.",
  "Prometto di essere onesto con me stesso prima che con gli altri.",
  "Voglio ricominciare a fare le domande difficili, anche a me stesso.",
  "Prometto di non spegnere la voce che mi chiede di cambiare.",
  "Da stasera provo a essere meno duro con chi sbaglia, incluso io.",
  "Prometto di tornare a sorridere anche nei giorni difficili.",
  "Voglio smettere di aspettare il momento giusto per essere felice.",
  "Prometto di ringraziare chi ha creduto in me quando io non ci credevo.",
  "Oggi scelgo di essere lo specchio in cui gli altri si riconoscono.",
  "Prometto di ricordarmi, ogni giorno, che il cambiamento parte da qui.",
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
 * Pesca `count` frasi, evitando quelle in `usedBodies` finche' il pool non
 * esaurito lo permette. Se il residuo non basta, ripesca dall'intero pool
 * invece di restituire meno frasi di quante richieste: il pulsante in
 * `/admin` deve poter essere premuto piu' volte in una serata senza fallire.
 */
export function pickSyntheticPhrases(
  usedBodies: readonly string[],
  count: number,
  rng: () => number = Math.random,
): string[] {
  if (SYNTHETIC_PHRASES.length === 0 || count <= 0) return [];

  const used = new Set(usedBodies);
  const unused = shuffle(SYNTHETIC_PHRASES.filter((p) => !used.has(p)), rng);
  if (unused.length >= count) return unused.slice(0, count);

  const rest = shuffle(SYNTHETIC_PHRASES, rng);
  const result = [...unused];
  for (let i = 0; result.length < count; i++) {
    result.push(rest[i % rest.length]!);
  }
  return result;
}
