# Live Audience Messages

Il pubblico inquadra un QR code, scrive una dedica dal telefono, e il messaggio
compare sul maxischermo in tempo reale.

```
PUBBLICO → QR → /            → POST /api/messages → DB
                                      ↓
                              campanella realtime
                                      ↓
                  /display → GET /api/messages?since=… → maxischermo
                                      ↑
                              /admin (moderazione)
```

Il maxischermo ha **due pagine**, e si passa dall'una all'altra quando decidi tu:

```
/qr        prima e tra un set e l'altro — solo il QR
   │
   │  (i messaggi intanto arrivano e si accumulano sul server)
   ▼
/display   dal momento in cui parte lo spettacolo — solo messaggi
           il QR non ricompare mai
```

---

## Avvio in trenta secondi

```bash
npm install
npm run dev
```

Non serve un account. Non serve Docker. Non serve configurare niente.

| pagina | indirizzo |
| --- | --- |
| Pubblico | http://localhost:3000 |
| Maxischermo — invito | http://localhost:3000/qr |
| Maxischermo — messaggi | http://localhost:3000/display |
| Moderazione | http://localhost:3000/admin?k=dev-admin-token |
| Moderazione — impostazioni | http://localhost:3000/admin/settings |

Con i default l'app gira con un file JSON al posto del database e senza
WebSocket: la latenza è di ~2 secondi invece di ~150 ms, tutto il resto è
identico. Serve per sviluppare, e nella sezione [Piano C](#piano-c--se-al-locale-non-cè-rete)
si scoprirà che serve anche ad altro.

Per provarlo davvero: apri `/display` su un secondo schermo e lancia

```bash
npm run burst -- --count 50 --window 5
```

Poi **guarda lo schermo**. Nessuna asserzione sostituisce il vedere se la coda
si smaltisce e se l'ordine tiene.

---

## Come funziona

### Il modello: campanella e rilettura

L'evento realtime **non contiene il messaggio**. Dice soltanto "c'è qualcosa di
nuovo", e il display risponde facendo una `GET` che è l'unica fonte di verità.

Sembra un giro in più. In cambio risolve cinque problemi con un solo
meccanismo:

| Problema | Perché sparisce |
| --- | --- |
| La chiave anon di Supabase è nel browser: chiunque potrebbe pubblicare un finto messaggio sul canale | Un evento falso provoca solo una `GET` che non restituisce nulla |
| Buco di messaggi dopo una disconnessione | Alla riconnessione il cursore è vecchio: il buco si richiude da solo |
| Il polling di riserva è un secondo percorso da mantenere | Non lo è: è la stessa funzione, chiamata da un timer invece che da un evento |
| Burst di messaggi | Venti segnali in due secondi si raggruppano in **una** richiesta che ne restituisce venti |
| Ordine e duplicati | Il server ordina per `released_at`, il cursore garantisce il resto |

La quarta e la terza sono quelle che contano il giorno del concerto: il
percorso degradato viene esercitato a ogni singola richiesta, quindi non può
rompersi senza che ce ne accorgiamo prima.

Conseguenza: il provider realtime è **intercambiabile**. Il transport è
un'interfaccia di trenta righe in [`src/lib/realtime/transport.ts`](src/lib/realtime/transport.ts).

### La moderazione senza moderatore

Il problema non è filtrare le parolacce. È il suo opposto: se la moderazione
manuale è attiva e nessuno guarda la coda, **il maxischermo resta nero per
tutto il concerto**. Un sistema che funziona perfettamente e non mostra niente.

Da qui il *dead-man switch*: la presenza dell'operatore è un fatto osservato,
non una configurazione. Ogni pagina sotto `/admin` (la coda su `/admin`, le
impostazioni su `/admin/settings`) interroga la stessa coda di continuo, e
quel polling **è** il segnale di presenza. Tenere aperta una qualunque delle
due è l'unico gesto necessario per cambiare il comportamento del sistema.

Il filtro produce tre esiti, non due:

| Esito | Con operatore | Senza operatore |
| --- | --- | --- |
| `clean` | va in coda, un tap per approvarlo | **rilasciato da solo** dopo `AUTO_RELEASE_DELAY_MS` |
| `suspect` (volgarità, link, numeri) | va in coda | **resta fermo per sempre**, non va mai a schermo |
| `blocked` (slur, minacce) | rifiutato, non entra in coda | rifiutato |

Tre modalità, commutabili a caldo dalla console:

- **manuale** — niente esce senza un umano. Se chiudi la console, lo schermo si ferma.
- **assistita** — *(default)* il comportamento descritto sopra.
- **automatica** — decide il filtro; i dubbi restano comunque in coda.

Chi invia riceve **sempre la stessa conferma**, qualunque sia l'esito reale. Se
sapesse di essere stato bloccato riproverebbe finché non aggira il filtro, e
chi ha scritto qualcosa di normale non merita di leggere "rifiutato".

Una nota sulle liste italiane in
[`wordlists.it.ts`](src/lib/domain/wordlists.it.ts): a un concerto rock
"che cazzo di serata!" è entusiasmo, non un problema. La volgarità leggera è
`suspect`, le slur sono `blocked`. Sono due cose diverse e vanno trattate
diversamente.

### Il display: due pagine, non due stati

`/qr` mostra l'invito, `/display` mostra i messaggi. Sono rotte separate di
proposito: la regola "una volta partiti i messaggi il QR non ricompare" non è
affidata a una variabile che qualcuno potrebbe rimettere a posto per sbaglio —
le due cose non condividono nemmeno una pagina.

Mentre `/qr` è proiettato i messaggi continuano ad arrivare e si accumulano
**sul server**. Quando apri `/display`, la prima richiesta restituisce
l'arretrato recente e parte tutto, il più vecchio per primo. L'accumulo e il
rilascio non sono stati costruiti: sono una conseguenza del cursore.

Per sapere quando è il momento di passare, guarda i contatori su `/admin`:
sono già lì, sul telefono di chi modera.

Il testo entra lettera per lettera con un blur morbido (libreria `motion`),
con un piccolo zoom continuo per tutta la permanenza a schermo; l'uscita è un
fadeout semplice, non lettera per lettera. `motion` vive solo qui: il form
del pubblico (`src/components/audience/MessageForm.tsx`) resta CSS puro,
perché gira su un telefono con rete cellulare satura dove ogni kilobyte in
più è un invio in meno che va a buon fine.

### Il motore

È un reducer puro — coda, rotazione, dedup, tempi, macchina a stati — senza
React e senza I/O ([`src/lib/display/engine.ts`](src/lib/display/engine.ts)).

**Lo schermo non torna mai vuoto.** I messaggi nuovi hanno sempre la
precedenza; quando non ne arrivano, quelli già passati continuano a girare a
rotazione, senza mai ripetere due volte di fila lo stesso. La scelta di chi
rientra non segue un giro fisso: pesca sempre tra i messaggi mostrati **meno
volte finora** (pareggio casuale) — con una canzone lunga e pochi messaggi è
quello che evita che qualcuno se ne veda ripetuto uno molto più degli altri.
Con un solo messaggio in tutto, quello resta in scena invece di uscire e
rientrare da solo: sarebbe solo un lampeggio.

Il tempo di permanenza cresce con la lunghezza del messaggio e si comprime
verso il minimo man mano che la coda si allunga: mostrare alle 23:10 un
messaggio delle 22:40 è peggio che mostrarlo per meno tempo.

Una conseguenza della rotazione che è costata due righe e vale la pena
conoscere: quando l'operatore ritira un messaggio, questo viene tolto **anche**
dallo storico. Altrimenti tornerebbe a schermo qualche minuto dopo, ed è il
modo peggiore di scoprire che il ritiro non era definitivo. Stesso discorso per
il panic button, che svuota anche la rotazione.

---

## Passare a Supabase

Serve per la produzione: su Vercel ogni funzione ha il proprio processo, quindi
il driver `memory` non può funzionare (e infatti si rifiuta di partire lì).

1. Crea un progetto su [supabase.com](https://supabase.com) — piano gratuito,
   **regione EU (Frankfurt)** per stare vicino alle funzioni Vercel.
2. Apri *SQL Editor* e incolla tutto
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. In *Project Settings → API* copia URL, `anon key` e `service_role key`.
4. Scrivi `.env.local`:

```bash
DB_DRIVER=supabase
NEXT_PUBLIC_REALTIME_DRIVER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
SUPABASE_SERVICE_ROLE_KEY=ey...

IP_HASH_SALT=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 16)
```

> La `service_role key` scavalca le policy RLS. Non deve **mai** avere il
> prefisso `NEXT_PUBLIC_`, altrimenti finisce nel bundle del browser.

RLS è attiva su entrambe le tabelle senza alcuna policy: la chiave anon non può
leggere né scrivere niente. Tutto passa dalle API route.

## Deploy su Vercel

```bash
npx vercel
```

Poi in *Settings → Environment Variables* metti le stesse variabili di
`.env.local`. `vercel.json` fissa già la regione a `fra1`.

**Warm-up (opzionale ma consigliato).** La prima richiesta della serata paga il
cold start. Non voglio che a pagarlo sia la prima persona che scrive: punta un
pinger su `/api/health` ogni 5 minuti nelle ore dell'evento. Su Vercel Pro
basta un cron; sul piano Hobby i cron girano una volta al giorno, quindi usa un
servizio di uptime esterno gratuito.

Genera il QR per la serata:

```bash
npm run qr -- --url https://tuo-dominio.vercel.app --out qr.svg
```

---

## Sicurezza

| Difesa | Dove |
| --- | --- |
| Idempotenza (`clientMsgId` unico) | Impedisce il doppione a schermo quando la risposta si perde e l'utente ritocca INVIA |
| Rate limit sessione / IP / globale | Postgres, tre count su indice. **Controllato dopo l'idempotenza**: un rinvio non è un messaggio nuovo |
| Honeypot + tempo minimo di compilazione | Scarto silenzioso: risposta identica a un successo |
| Payload ≤ 2 KB, solo `application/json` | Rifiutato prima del parsing |
| Rimozione bidi / zero-width / zalgo | Un carattere RLO fa leggere a schermo l'opposto di quello che l'operatore ha approvato |
| Conteggio in grafemi | Un'emoji vale 1: il contatore del telefono e il server dicono lo stesso numero |
| IP salvato solo come hash con salt | Serve a contare, non a identificare |
| CSP stretta, nessun dominio esterno | Font self-hosted, QR generato in locale |
| Nessun CORS | Un endpoint pubblico non deve essere aperto a chiunque |
| `react/no-danger` come errore di lint | L'escaping di React è l'ultima linea di difesa |

### Perché Turnstile è spento di default

È implementato e si accende con una variabile d'ambiente, ma parte disattivato,
e la scelta va contro l'istinto.

Turnstile aggiunge una dipendenza da un CDN esterno **nel percorso critico**: se
la rete del locale è satura o filtra qualcosa, il pubblico non riesce più a
inviare e dal palco non si può fare niente. Per una serata di due ore il rischio
di indisponibilità è peggiore del rischio bot.

Se il link finisce in giro, si accende in trenta secondi:

```bash
NEXT_PUBLIC_TURNSTILE_ENABLED=true
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
TURNSTILE_FAIL_OPEN=true   # se Cloudflare non risponde, lascia passare
```

---

## RUNBOOK — la sera del concerto

Due volte su tre, quando un sistema come questo fallisce dal vivo non è il
software: è la rete del locale o il portatile che si addormenta.

### Il giorno prima

- [ ] `npm run build` senza errori, deploy fatto e provato
- [ ] `/api/health` risponde `ok: true` con i driver giusti
- [ ] QR generato, stampato **e provato** con due telefoni diversi
- [ ] `ADMIN_TOKEN` e `IP_HASH_SALT` cambiati rispetto ai default
- [ ] Link `/admin?k=…` salvato sul telefono di chi modera

### Al soundcheck

- [ ] Display su connessione **dedicata** (ethernet o hotspot 4G proprio), mai
      sul wifi del pubblico
- [ ] Sospensione e screensaver **disattivati a livello di sistema operativo** —
      la Wake Lock API copre lo schermo, non tutto
- [ ] `/qr` e `/display` aperti in **due schede**, entrambe a schermo intero:
      durante il concerto si passa dall'una all'altra, non si digitano URL al buio
- [ ] Su `/display`, click su "Entra in scena" e fullscreen verificato
- [ ] `npm run burst -- --count 30 --window 3` e schermo guardato per un minuto
- [ ] Prova di disconnessione: stacca la rete del display per trenta secondi.
      Deve continuare a mostrare la coda e riprendere da solo, senza che il
      pubblico se ne accorga
- [ ] Modalità di moderazione decisa e impostata su `/admin/settings`
- [ ] Pulsante rosso "Svuota lo schermo" (in `/admin/settings`) mostrato a chi modera

### Durante

- Si parte su `/qr`. Quando ci sono abbastanza messaggi in coda (li vedi su
  `/admin`), passa alla scheda `/display`: da lì in poi solo messaggi
- Il pallino in basso a destra del display: verde = realtime, azzurro =
  polling *(va bene lo stesso)*, rosso = rete assente
- Se qualcosa di brutto arriva a schermo: **Svuota lo schermo adesso** in
  `/admin/settings` (chiede due tap)
- Se la coda si allunga troppo, passa a **automatica** dalla console

### Se qualcosa va storto

| Sintomo | Cosa fare |
| --- | --- |
| Il QR è ancora a schermo e i messaggi non partono | Sei sulla scheda `/qr`: passa a `/display` |
| Lo schermo non mostra niente e la coda è piena | Nessuno sta moderando in modalità *manuale*: passa ad *assistita* |
| Lo schermo è fermo, il pallino è rosso | Controlla la rete del display. La coda già scaricata continua comunque |
| Arrivano troppi messaggi | Alza `RL_SESSION_WINDOW_MS`, oppure lascia fare alla compressione automatica dei tempi |
| Spam da fuori | Accendi Turnstile |

---

## Piano C — se al locale non c'è rete

Non è implementato, ma non è precluso: repository e transport sono già
interfacce, e il driver `memory` esiste già ed è testato.

Girando l'app su un portatile con hotspot — pubblico collegato a quello —
servirebbe sostituire due implementazioni, non riscrivere l'applicazione.
Decisione da prendere solo dopo il sopralluogo, e lo sapremo settimane prima.

---

## Struttura

```
src/
├─ app/
│  ├─ page.tsx                 /          pubblico
│  ├─ qr/page.tsx              /qr        maxischermo: invito
│  ├─ display/page.tsx         /display   maxischermo: messaggi
│  ├─ admin/page.tsx           /admin              moderazione: coda
│  ├─ admin/settings/page.tsx  /admin/settings     modalità, reset, panic
│  └─ api/
│     ├─ messages/             POST invio · GET feed · seen (telemetria)
│     ├─ admin/                queue (+heartbeat) · moderate · control · session
│     └─ health/               diagnostica e warm-up
├─ components/
│  ├─ audience/                form del pubblico
│  ├─ display/
│  │  └─ renderers/            ← punto di innesto dello STEP 2
│  └─ admin/                   console di moderazione
└─ lib/
   ├─ config.ts / config.public.ts    tutti i parametri, un posto solo
   ├─ domain/                  logica pura: zero I/O, zero React, 100% testata
   ├─ db/                      memory.ts · supabase.ts dietro un'interfaccia
   ├─ display/                 engine (reducer puro) · stream · tempi
   ├─ realtime/                transport (browser) · publish (server)
   └─ service/                 orchestrazione, usata da route e script
```

La regola: **`lib/domain` non importa niente** — né React, né Next, né
Supabase. È logica pura che gira in millisecondi nei test. `lib/db` è l'unico
posto che sa cosa sia Supabase. I componenti non fanno mai I/O diretto.

---

## Comandi

```bash
npm run dev         # sviluppo
npm run build       # build di produzione
npm test            # 98 test
npm run typecheck   # TypeScript strict
npm run lint
npm run burst       # prova di carico da guardare a schermo
npm run qr          # genera il QR
```

---

## STEP 2 — l'organismo digitale

L'architettura è già predisposta. Il motore espone `all` (tutti i messaggi
della serata, non solo quello in scena) proprio perché la "rete viva" non
mostra *un* messaggio: mostra l'insieme accumulato di tutti, dove ogni
messaggio è un nodo che resta.

Aggiungere un renderer WebGL significa scrivere un componente che implementa
[`RendererProps`](src/components/display/renderers/types.ts) e registrarlo:

```ts
export const RENDERERS = {
  basic: BasicRenderer,
  network: NetworkRenderer,   // ← STEP 2
};
```

Poi `/display?renderer=network`. Backend, API, realtime e motore del display
non vengono toccati — ed è possibile tornare a `basic` con un tasto se al
soundcheck il WebGL fa i capricci sul portatile del service.
