/**
 * Configurazione visibile al browser.
 *
 * IMPORTANTE: ogni `process.env.NEXT_PUBLIC_*` deve essere referenziato
 * LETTERALMENTE, altrimenti il bundler non riesce a sostituirlo a build time
 * e nel browser arriva `undefined`. Niente accessi dinamici qui dentro.
 */

function int(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

export type RealtimeDriver = "polling" | "supabase";

export const publicConfig = {
  event: {
    slug: process.env.NEXT_PUBLIC_EVENT_SLUG || "default",
    name: "Live",
    /** Frase dell'animazione di chiusura, mostrata dopo il pulsante in /admin. */
    closingPhrase: process.env.NEXT_PUBLIC_CLOSING_PHRASE || "Make that change",
  },

  limits: {
    /** Lunghezza massima del messaggio, in *grafemi* (un'emoji = 1). */
    messageMaxLength: int(process.env.NEXT_PUBLIC_MESSAGE_MAX_LENGTH, 80),
    nameMaxLength: int(process.env.NEXT_PUBLIC_NAME_MAX_LENGTH, 24),
    /**
     * La frase di chiusura sta da sola al centro dello schermo, non in coda
     * a un messaggio: deve restare leggibile da lontano su una riga o due,
     * non un paragrafo. In grafemi, come gli altri limiti di testo.
     */
    closingPhraseMaxLength: int(process.env.NEXT_PUBLIC_CLOSING_PHRASE_MAX_LENGTH, 60),
  },

  realtime: {
    driver: (process.env.NEXT_PUBLIC_REALTIME_DRIVER || "polling") as RealtimeDriver,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    /** Polling normale quando il canale realtime e' vivo (rete di riserva). */
    pollIntervalMs: int(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS, 2000),
    /** Backoff massimo del polling su rete instabile (tethering 4G). */
    pollMaxIntervalMs: int(process.env.NEXT_PUBLIC_POLL_MAX_INTERVAL_MS, 8000),
    /** Nessun segnale ne' heartbeat per questo tempo => si passa a polling. */
    staleAfterMs: int(process.env.NEXT_PUBLIC_REALTIME_STALE_MS, 5000),
    /** I segnali ravvicinati vengono raggruppati in una sola fetch. */
    signalDebounceMs: int(process.env.NEXT_PUBLIC_SIGNAL_DEBOUNCE_MS, 150),
    /**
     * Tetto di attesa per una richiesta del feed.
     *
     * Senza, una `fetch` appesa su un wifi che sta morendo tiene occupato il
     * lock di sincronizzazione a tempo indefinito: lo schermo continua a far
     * ruotare quello che ha gia', ma i messaggi nuovi smettono di arrivare e
     * nessun timer riesce a rimediare. Con il tetto il tentativo fallisce,
     * entra nel conteggio dei fallimenti e riparte col backoff.
     */
    fetchTimeoutMs: int(process.env.NEXT_PUBLIC_FETCH_TIMEOUT_MS, 8000),
  },

  display: {
    enterMs: int(process.env.NEXT_PUBLIC_DISPLAY_ENTER_MS, 500),
    exitMs: int(process.env.NEXT_PUBLIC_DISPLAY_EXIT_MS, 400),
    /** hold = base + perChar * caratteri, poi clampato tra min e max. */
    holdBaseMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_BASE_MS, 4500),
    holdPerCharMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_PER_CHAR_MS, 60),
    holdMinMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_MIN_MS, 5000),
    holdMaxMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_MAX_MS, 14000),
    /** Oltre questa profondita' di coda si comincia ad accelerare. */
    burstThreshold: int(process.env.NEXT_PUBLIC_DISPLAY_BURST_THRESHOLD, 8),
    /**
     * Coda satura: hold al minimo dell'accelerazione. Larga apposta: lo
     * schermo resta acceso anche dopo il concerto, quindi la coda non va
     * smaltita in fretta, e una rampa lunga non si nota a schermo.
     */
    burstSaturation: int(process.env.NEXT_PUBLIC_DISPLAY_BURST_SATURATION, 60),
    /**
     * Fin dove l'accelerazione accorcia una frase: piu' alto di holdMinMs,
     * cosi' anche con 200 frasi in coda una frase tipica (~8s) perde al
     * massimo un quinto del tempo. Le frasi gia' piu' brevi non si toccano.
     */
    holdBurstMinMs: int(process.env.NEXT_PUBLIC_DISPLAY_HOLD_BURST_MIN_MS, 6500),
    /** Tetto di sicurezza della coda in memoria. */
    maxQueueLength: int(process.env.NEXT_PUBLIC_DISPLAY_MAX_QUEUE, 500),
    /**
     * Tasto che su `/display` passa alla modalita' demo e ritorno (maiuscole
     * o minuscole indifferenti, mai con Cmd/Ctrl/Alt). Da tastiera e non da
     * un'icona: sul display il puntatore e' nascosto.
     */
    demoToggleKey: process.env.NEXT_PUBLIC_DISPLAY_DEMO_KEY || "x",
  },

  moderation: {
    /** Sotto questa soglia l'admin avvisa che la rotazione e' scarna. */
    lowRotationThreshold: int(process.env.NEXT_PUBLIC_LOW_ROTATION_THRESHOLD, 8),
    /**
     * Da questa soglia in su la rotazione e' abbondante: semaforo verde.
     * Calcolata sugli 8:25 (505s) della canzone e sui tempi reali del
     * display (enter + hold + exit in questo stesso file): una frase di
     * lunghezza tipica (~60 caratteri) occupa ~9s di ciclo, quindi ~57
     * frasi coprono la canzone senza ripetersi. 60 con un po' di margine.
     */
    comfortableRotationThreshold: int(
      process.env.NEXT_PUBLIC_COMFORTABLE_ROTATION_THRESHOLD,
      60,
    ),
    /**
     * Da questa soglia in su ci sono piu' frasi di quante ne entrino nella
     * canzone: semaforo blu. Con frasi tipiche (~60 caratteri) e la coda
     * accelerata fino a holdBurstMinMs (6,5s + enter + exit = 7,4s) in 505s
     * ne passano ~68. Le altre restano in coda in ordine di arrivo e vanno a
     * schermo dopo la canzone: lo schermo resta acceso.
     */
    overflowRotationThreshold: int(
      process.env.NEXT_PUBLIC_OVERFLOW_ROTATION_THRESHOLD,
      70,
    ),
  },

  turnstile: {
    siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    enabled: bool(process.env.NEXT_PUBLIC_TURNSTILE_ENABLED, false),
  },

  /** Tempo minimo tra apertura form e invio: sotto questa soglia e' un bot. */
  minSubmitMs: int(process.env.NEXT_PUBLIC_MIN_SUBMIT_MS, 1500),

  /**
   * Tetto di attesa per l'invio dal telefono.
   *
   * Su una cella satura da centinaia di persone una richiesta puo' restare
   * appesa per un minuto: chi ha scritto vede solo il pulsante che gira e non
   * ha modo di riprovare. Meglio dichiararla persa e mostrare l'errore — il
   * rinvio e' idempotente (`clientMsgId` non cambia), quindi se il messaggio
   * era arrivato lo stesso non compare due volte a schermo.
   */
  submitTimeoutMs: int(process.env.NEXT_PUBLIC_SUBMIT_TIMEOUT_MS, 12_000),
} as const;

export type PublicConfig = typeof publicConfig;
