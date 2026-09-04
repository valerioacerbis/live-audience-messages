# Prossimi passi

Documento di ripresa. Scritto per essere letto da zero: chi riparte non ha il
contesto della conversazione in cui il progetto è nato.

Leggi prima il [README](README.md) — architettura, scelte e RUNBOOK stanno lì.
Questo file dice solo **cosa resta da fare e in che ordine**.

**Data della prima serata: fine ottobre 2026.** È il vincolo che ordina tutto.

> **Filo aperto, ripartire da qui:** [Blocco F — latenza sotto carico](#blocco-f--latenza-sotto-carico--aperto).
> La tenuta a 350 spettatori è verificata per quanto riguarda i rifiuti (zero) e
> il rilascio automatico (perfetto). Il p95 dell'invio era arrivato a 10.8s con
> una modifica che è stata **riportata indietro** (2026-09-01) perché il
> guadagno sul caso medio non valeva il peggioramento del caso peggiore. Lì
> dentro c'è cosa è già stato escluso e qual è la prossima misura da fare —
> non ricominciare da capo.

---

## Dove siamo

**STEP 1 completo, Supabase collegato e app già in deploy di produzione su
Vercel.** Non più solo locale: `.env.local` gira con `DB_DRIVER=supabase` e
`NEXT_PUBLIC_REALTIME_DRIVER=supabase`, il progetto Vercel
(`live-audience-messages`) ha tutte le env var di produzione impostate, e ci
sono deploy Production recenti.

**Aggiunta del 2026-09-02 (frase di chiusura configurabile a caldo):**

- La frase della schermata di chiusura non è più fissa a build time.
  `EventRecord.closingPhrase` (nullable, migration
  [`0003_closing_phrase.sql`](supabase/migrations/0003_closing_phrase.sql))
  è editabile da un nuovo campo in `/admin/settings`
  ([`SettingsConsole.tsx`](src/components/admin/SettingsConsole.tsx)), azione
  `set-closing-phrase` su `/api/admin/control`. `null` = nessuna
  sovrascrittura, si usa `NEXT_PUBLIC_CLOSING_PHRASE` (solo più il default
  iniziale, non più l'unica fonte).
- Stesso modello "campanella + rilettura" di `ended`: `getFeed` porta
  `closingPhrase: string` (già risolta al default) nello stesso payload dei
  messaggi, quindi un cambio in `/admin/settings` raggiunge `/display` entro
  un ciclo di polling — anche a schermata di chiusura già a schermo.
- Pulsante fisso in `/admin` rinominato: "Chiudi la serata" → "Vai alla
  schermata finale", "Riapri la serata" → "Rimetti i messaggi a schermo". Il
  comportamento non cambia (stesso `status`/`event.ended`), solo il nome:
  non è detto che chi lo preme stia chiudendo l'ultimo brano della serata.
- **Bug trovato e chiuso lo stesso giorno**: su Supabase reale la colonna
  `closing_phrase` non esisteva ancora (migration non applicata), quindi ogni
  salvataggio falliva con 500 — e `SettingsConsole` lo ingoiava in silenzio,
  buttando via la frase appena scritta senza dirlo. Corretto: un salvataggio
  fallito ora mostra un errore e **non** cancella il draft. **La migration va
  ancora applicata sul progetto Supabase reale** (SQL Editor, vedi Blocco A) —
  finché non lo è, salvare la frase su quell'ambiente continua a fallire.
- Limite di lunghezza sulla frase (default 60 grafemi,
  `NEXT_PUBLIC_CLOSING_PHRASE_MAX_LENGTH`): sta da sola al centro dello
  schermo, non in coda a un messaggio. Stessa sanitizzazione del corpo del
  messaggio (`sanitizeText`/`countGraphemes`), contatore "usati / max" in
  `/admin/settings` che disabilita Salva oltre soglia, verifica anche lato
  server in `setClosingPhrase` (`src/lib/service/admin.ts`) — 5 nuovi test in
  `tests/unit/service.test.ts`.
- Impostazioni riorganizzate: il campo vive ora dentro una sezione
  "Schermata finale" (coerente col nome del pulsante), non più una sezione a
  se stante intitolata "Frase di chiusura".
- Non ancora verificato su schermo vero — voce aggiunta alla checklist del
  Blocco B qui sotto.

**Novità di questa sessione (schermata di chiusura), da vedere su schermo
vero nel Blocco B:**

- Nuovo componente [`ClosingAnimation.tsx`](src/components/display/ClosingAnimation.tsx):
  le parole della frase configurata (`NEXT_PUBLIC_CLOSING_PHRASE`, default
  "Make that change") compaiono una alla volta con un ingresso a scatto, poi
  resta scritta la frase intera con lo stesso ingresso lettera-per-lettera dei
  messaggi del pubblico (`AnimatedLetters`) e uno zoom continuo lentissimo.
- Pulsante fisso in `/admin` (non in `/admin/settings`: deve restare
  raggiungibile senza uscire dalla coda) — "Chiudi la serata", doppio tap.
  Interrompe la rotazione su `/display` e mostra la schermata di chiusura.
- **Bidirezionale**: lo stesso pulsante diventa "Riapri la serata" (doppio
  tap, non tocca i messaggi) quando l'evento è chiuso. Il display torna alla
  rotazione da solo entro un ciclo di polling, senza ricaricare la pagina —
  serve sia per un tap dato per sbaglio la sera vera, sia per provare
  l'animazione in anteprima senza dover smontare l'evento di test.
- Riusa `EventRecord.status` (`live`/`ended`, già nello schema DB, prima mai
  scritto da nessun codice applicativo) e gli eventi realtime `event.ended`/
  `event.started` (già nel tipo, prima mai pubblicati): nessuna migration,
  nessun nuovo canale. `getFeed` porta `ended: boolean` nello stesso payload
  dei messaggi — stesso modello "campanella + rilettura" di tutto il resto.
- 4 nuovi test unitari sul reducer (`ended` come flag bidirezionale,
  idempotente, che non tocca coda/storico/fase) — 119 test in tutto.
- Rimossa la pagina di anteprima `src/app/dev/closing-animation` usata per
  mettere a punto l'animazione: ora si prova direttamente dai due pulsanti
  in `/admin`, non serve più una pagina isolata.

**Novità della sessione precedente (display + form pubblico):**

- `/display`: il messaggio entra lettera per lettera con blur (libreria
  `motion`, solo qui), con uno zoom continuo e impercettibile per tutta la
  permanenza a schermo; l'uscita resta un semplice fadeout. Il nome sotto il
  messaggio non fa il lettering: appare con un fade-in + risalita dal basso,
  solo a frase già scritta.
- Rotazione (`src/lib/display/engine.ts`): non è più un giro mescolato, ma
  pesca sempre tra i messaggi mostrati **meno volte finora** (pareggio
  casuale, mai lo stesso due volte di fila). Pensata per una canzone lunga
  con pochi messaggi: nessuno finisce per vedersi ripetuto molto più degli
  altri.
- Limite messaggio abbassato da 280 a 120 caratteri; tempo di permanenza a
  schermo rallentato (base 2500→4500ms, minimo 3000→5000ms, massimo
  8000→14000ms) per lo stesso motivo — canzone lunga, meno giri di rotazione.
- Pagina di successo del form pubblico ridisegnata: spunta animata (disegno
  del tratto, non un'apparizione secca), logo/nome evento/frase nascosti
  mentre è a schermo, copy "La tua promessa è nello specchio." Resta CSS
  puro, niente `motion`: qui ogni kilobyte in più conta per la rete satura.

**Verificato davvero (schermata di chiusura):**

- 119 test (`npm test`), typecheck strict, lint — tutti puliti
- End-to-end reale con due schede del browser (non solo test unitari): apri
  `/admin` e `/display`, clicca "Chiudi la serata" (doppio tap) → il display
  passa alla chiusura entro ~3s di polling, senza reload. Clicca "Riapri la
  serata" → il display torna alla rotazione normale entro ~3s, sempre senza
  reload. Verificato anche via chiamata diretta a `/api/admin/control`
  (`end-event` → `status: "ended"`, `reopen-event` → `status: "live"`),
  bypassando la UI per isolare backend da frontend.
- Nessun errore in console su nessuna delle due pagine durante tutto il ciclo
- Build non ri-verificato in questa sessione (solo `dev`, `typecheck`, `lint`, `test`)

**Verificato nella sessione precedente:**
- Flusso completo via HTTP: invio → moderazione → display, cursore ordinato, zero duplicati
- Burst di 50 messaggi in 5s: 51 nel feed, 0 doppioni, ordine corretto
- Dead-man switch end-to-end: operatore presente → coda; operatore sparisce → i
  `clean` escono da soli, i `suspect` restano fermi
- Idempotenza: 3 invii identici → 1 riga nel DB, stesso id restituito
- Rate limit (429), payload oversize (413), content-type errato (415), admin senza token (401)
- Accumulo su `/qr` → apertura di `/display` → l'arretrato parte in ordine
- Login admin: `/admin?k=…` → 307 → 303 con cookie httpOnly → 200 — **superato**:
  il login ora passa da un form password su `/admin/login` (POST su
  `/api/admin/session`), non più da un token in querystring. Da riverificare
  con questo flusso.
- **Supabase contro un'istanza reale**: i tre punti a rischio del vecchio
  Blocco A sono stati toccati con mano — i commit `cae4a4a` (polling
  incrementale, cache display stantia, reset messaggi) e `98ececd` (cache da
  svuotare al panic button) sono fix nati proprio testando dal vivo. Non
  risultano invece note esplicite sulla forma di ritorno di
  `insert_message_idempotent` né su `release_abandoned` — se qualcosa in
  quell'area si comporta in modo strano, sono il primo sospetto.
- **Deploy su Vercel**: progetto linkato, env var di produzione impostate
  (incluso `RATE_LIMIT_ENABLED`, oggi `false` sia in locale che in
  produzione), deploy Production andati a buon fine nelle ultime ore.

**Non confermato esplicitamente — vedi Blocco B:**

- La checklist di verifica visiva di `/qr` e `/display` non risulta spuntata
  punto per punto, anche se i commit `18151dd` (tema "Man in the Mirror") e
  `7095761` (accenti nel copy pubblico) sono il genere di modifica che si fa
  guardando lo schermo, non leggendo codice.
- `/api/health` non è stato controllato in produzione in questa sessione (la
  richiesta diretta ha incontrato la protezione dei deploy di Vercel, non
  necessariamente un problema dell'app).
- Nessun `qr.svg` generato con l'URL di produzione reale nella root del
  progetto.

---

## Blocco A — Supabase — ✅ fatto

~~Bloccante, ~1 ora~~ — completato. `DB_DRIVER=supabase` e
`NEXT_PUBLIC_REALTIME_DRIVER=supabase` sono attivi sia in `.env.local` che su
Vercel Production. I tre punti a rischio elencati nella versione precedente
di questo file (forma di ritorno di `insert_message_idempotent`, broadcast
realtime, `release_abandoned`) non hanno lasciato bug aperti noti, ma non
risultano nemmeno verificati uno per uno con una nota esplicita — se in futuro
qualcosa si rompe in quell'area, sono il primo posto dove guardare.

Riferimento tecnico se serve rifare il collegamento da zero: SQL Editor di
Supabase → [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
poi `.env.local` come da README (§"Passare a Supabase").

---

## Blocco B — Verifica visiva (~30 minuti)

Probabilmente in corso (vedi i commit sul tema pubblico), ma la checklist
puntuale non risulta completata. Da rifare/confermare adesso che il tema
pubblico è cambiato.

Aprire `/qr` e `/display` su uno schermo grande e controllare:

- [ ] `/qr`: il QR è leggibile da **5-6 metri**, con le luci accese. Se no,
      aumentare la dimensione in [`QrScreen.tsx`](src/components/display/QrScreen.tsx)
      (`min(46vh, 46vw)`)
- [ ] `/display`: ingresso lettera per lettera fluido (nessuno scatto tra una
      lettera e l'altra), zoom continuo impercettibile, uscita in fadeout
- [ ] Messaggio da 80 caratteri: entra nello schermo senza tagliarsi
      (`text-[clamp(2.5rem,5.5vw,7rem)]` in [`BasicRenderer.tsx`](src/components/display/renderers/BasicRenderer.tsx))
- [ ] Messaggio da 3 caratteri: non sembra sperduto
- [ ] Nome lungo, emoji, testo tutto maiuscolo — appare dopo la frase, non insieme
- [ ] Rotazione: con 3+ messaggi, nessuno si ripete finché gli altri non sono
      stati mostrati almeno una volta
- [ ] Pagina di successo del form pubblico (invia un messaggio da telefono):
      spunta animata, nessun logo/intestazione visibile, testo "La tua
      promessa è nello specchio."
- [ ] Con **un solo** messaggio: resta fermo, non lampeggia
- [ ] Fullscreen ("Entra in scena") e wake lock: lo schermo non si spegne in 15 minuti
- [ ] Il pallino di stato è invisibile da lontano ma leggibile da vicino
- [ ] `/admin` su un telefono vero: i bottoni si centrano al buio con una mano
- [ ] Schermata di chiusura su schermo vero: "Vai alla schermata finale" da
      `/admin` (doppio tap), le tre parole leggibili da lontano, frase finale
      con zoom impercettibile. Poi "Rimetti i messaggi a schermo" e verificare che
      `/display` torni alla rotazione da solo entro pochi secondi, senza
      reload. Provare anche a cambiare la frase da `/admin/settings` e
      verificare che arrivi a `/display` entro un ciclo di polling

Comando utile per riempire lo schermo:
```bash
npm run burst -- --count 20 --window 4
```

---

## Blocco C — Deploy su Vercel — ✅ fatto, restano tre verifiche

Progetto linkato, env var di produzione impostate, deploy Production
recenti. Restano da spuntare, probabilmente in pochi minuti:

1. Verificare che `/api/health` risponda `ok: true` con
   `drivers.db = "supabase"` (non controllato in questa sessione — la
   richiesta diretta ha incontrato la protezione dei deploy di Vercel).
2. Controllo intenzionale mai fatto: provare un deploy **senza**
   `DB_DRIVER=supabase` e verificare che l'app fallisca con il messaggio
   esplicito invece di partire con il driver sbagliato.
3. Generare il QR definitivo con il dominio vero:
   `npm run qr -- --url https://<dominio> --out qr.svg` — non risulta ancora
   fatto (nessun `qr.svg` nella root).

**Anti-pausa Supabase free — ✅ fatto (2026-09-04).** `vercel.json` ha un cron
giornaliero su `/api/health` (limite del piano Hobby), che fa query vere
contro il database e tiene il progetto attivo fra una sessione e l'altra.
Prima di questo, un progetto free si mette in pausa da solo dopo 7 giorni
senza traffico API e serve un "Restore" manuale dalla dashboard — rischio
concreto nelle settimane fra ora e la serata, non solo un dettaglio.

Warm-up per la serata (resta da fare, il cron giornaliero non basta): su
piano Hobby i cron Vercel girano una volta al giorno, quindi puntare un
pinger esterno gratuito su `/api/health` ogni 5 minuti nelle ore
dell'evento.

---

## Blocco D — Incoerenze note da chiudere

Piccole, ma già scritte nella documentazione come se esistessero.

**D1. ~~Il token dell'evento nel QR non viene validato.~~ — ✅ chiuso il 2026-08-31.**
`--token` non validava mai nulla lato server (era decorativo): tolto dallo
script `generate-qr.ts` e dalla riga del RUNBOOK in README. La protezione
contro lo spam da fuori resta solo Turnstile (spento di default, si accende
da env in 30 secondi).

**D2. La pagina audience ignora `?e=` (slug evento).**
`/qr` genera l'URL con `?e=<slug>` quando lo slug non è `default`, ma
[`src/app/page.tsx`](src/app/page.tsx) usa sempre `publicConfig.event.slug`.
Irrilevante con un evento solo; da sistemare insieme al multi-event.

**D3. Nessun test end-to-end.**
Il piano iniziale ne prevedeva uno con Playwright (telefono → display). Tutto è
coperto da test unitari e da verifiche manuali via HTTP, ma non c'è nulla che
attraversi il browser. Da valutare: forse la prova generale del blocco E vale
di più di un E2E automatico, per un progetto che gira una sera.

---

## Blocco E — Prova generale (fine settembre)

È il test che conta più di tutti gli altri messi insieme.

- 5-10 amici, i loro telefoni veri, un'ora di traffico reale
- Staccare la rete del display a tradimento un paio di volte: deve continuare a
  mostrare la coda e riprendere da solo
- Provare la moderazione da telefono mentre succede qualcos'altro
- Provare il panic button
- Far scrivere di proposito qualcosa di offensivo e verificare che non passi
- Chiudere `/admin` a metà e verificare che lo schermo non si fermi

La prova di carico sintetica è già stata fatta due volte (vedi Blocco F) e si
rilancia con `npm run sim`. Quella con persone vere resta necessaria lo stesso:
il simulatore parte da un solo IP e da una sola macchina, quindi non dice
niente su celle sature, telefoni vecchi e browser strani.

Da qui escono i bug veri. Lasciare tempo per sistemarli.

---

## Blocco F — Latenza sotto carico — APERTO

Sessione del 2026-09-01. Il filo è stato messo in pausa qui, con una domanda
precisa ancora senza risposta. **Leggi tutto prima di toccare qualcosa**: due
delle ipotesi ovvie sono già state provate e una ha peggiorato le cose.

### Come si riproduce

```bash
npm run sim -- --url https://live-audience-messages.vercel.app --spectators 350 --window 120
```

Simula 350 spettatori con sessione persistente e arrivi pesati verso l'inizio
([`scripts/live-sim.ts`](scripts/live-sim.ts)). Due avvertenze operative:

- **Chiudere prima tutte le schede `/admin` e `/admin/settings`.** Il loro
  polling è il segnale di presenza dell'operatore: se resta aperto i messaggi
  finiscono in coda invece che a schermo e il test non è confrontabile con i
  precedenti. Il timeout è 60 s dall'ultima chiamata.
- **Dopo, "Reset messaggi" in `/admin/settings`**: ogni esecuzione lascia
  ~465 messaggi finti nell'evento vero.

Le soglie vive si leggono da `/api/health?k=$ADMIN_PASSWORD` (campo
`rateLimit`, visibile solo con la password admin). È il modo per sapere cosa
gira davvero in produzione invece di dedurlo dai default del codice.

### Le due esecuzioni fatte

| | run 1 — `fra1`, 4 round trip | run 2 — `dub1`, 3 round trip |
| --- | --- | --- |
| accettati | 482 | 462 |
| 429 ambito `ip` / `global` | 0 / 0 | 0 / 0 |
| p50 | 619 ms | **520 ms** |
| p95 | 6 620 ms | **10 800 ms** |
| p99 | 8 678 ms | 13 411 ms |
| max | 10 061 ms | 14 937 ms |
| timeout lato client (>15 s) | 0 | 3 |
| picco accettati in 60 s | 248 | 238 |

### Cosa è chiuso e non va riaperto

- **Le soglie del rate limit sono giuste.** Zero rifiuti di ambito `ip` e
  `global` in entrambe le esecuzioni. Col vecchio `RL_IP_MAX=5` sarebbero
  stati respinti 477 messaggi su 482; il picco reale (248/min) sfiorava il
  vecchio tetto globale di 300.
- **Il dead-man switch regge sotto carico.** 465 messaggi su 465 rilasciati
  da soli, `pending: 0`, senza nessuno a moderare. Verificato due volte.
- **Non è un problema di regione.** Supabase è in West EU (Ireland) e le
  funzioni sono state spostate su `dub1` per stare nella stessa regione AWS.
  Ha portato la latenza a riposo da 250-445 ms a 180-245 ms — resta così.
  Non spostare Supabase a Francoforte: guadagnerebbe ~30 ms sul tratto
  telefono→funzione (il pubblico è in Italia) al prezzo di ricreare il
  progetto, ed è il rapporto rischio/beneficio sbagliato a poche settimane
  dalla serata.
- **La parallelizzazione idempotenza+rate limit è stata riportata indietro
  (2026-09-01).** Introdotta e testata nella stessa sessione: run 1
  (sequenziale) p50 619ms/p95 6.6s, run 2 (parallelo) p50 520ms/p95 10.8s. Il
  p50 migliorava ma il p95 peggiorava, ed è il p95 quello che produce un
  errore visibile in scena. `src/lib/service/messages.ts` è di nuovo
  sequenziale: `findByClientMsgId` prima, `checkRateLimit` dopo. **Non
  riprovare questa strada senza prima aver misurato la causa vera** (vedi
  sotto) — l'esperimento di run 2 aveva anche cambiato la regione nello stesso
  deploy, quindi non isolava la variabile.

### La domanda aperta

**Dove vanno i secondi del p95 (6.6s anche nella run sequenziale, che è lo
stato attuale)?** Due ipotesi che portano a rimedi opposti:

1. **Supabase gratuito che satura** sotto carico (CPU condivisa, ~5 query per
   invio) → la leva è meno query per richiesta, o il piano Pro.
2. **Vercel che accoda** mentre scala le istanze, ognuna con il suo avvio a
   freddo → il database è innocente e la leva è tutt'altra.

### La prossima cosa da fare, decisa ma non fatta

**Strumentare invece di indovinare.** Aggiungere un header `Server-Timing`
alla risposta di `POST /api/messages` con il tempo trascorso *dentro* la
funzione, e farlo registrare al simulatore accanto al tempo osservato dal
client. Una sola esecuzione discrimina:

- tempo interno alto → è il database (ipotesi 1)
- tempo interno basso, attesa del client alta → è la piattaforma (ipotesi 2)

Modifica piccola e senza rischio. **Da fare prima di qualunque altra
ottimizzazione**: la lezione della run parallela (poi riportata indietro) è
che cambiare a naso può peggiorare invece di migliorare.

### Perché conta, e quanto

Il timeout di invio dal telefono è a 12 s (`NEXT_PUBLIC_SUBMIT_TIMEOUT_MS`).
Con un p95 a 10,8 s e un massimo a 14,9 s, alla serata vera **qualche persona
vedrebbe un errore** invece della conferma. Non è il sistema che cade — il
rinvio è idempotente e non produce doppioni — ma è una brutta figura evitabile.

Da valutare a prescindere dalla diagnosi: **Supabase Pro (~25 $/mese) per il
solo mese di ottobre.** Risorse dedicate invece di CPU condivisa. Per una
serata sola, davanti a centinaia di persone, senza possibilità di hotfix, è
probabilmente l'assicurazione col miglior rapporto qualità-prezzo del progetto.

---

## STEP 2 — l'organismo digitale (ottobre)

L'architettura è già pronta: il motore espone `all` (tutti i messaggi della
serata) e `isReplay`, e il renderer si sostituisce aggiungendo un `case` in
[`renderers/index.tsx`](src/components/display/renderers/index.tsx).

```ts
export function MessageRenderer({ name, ...props }) {
  switch (name) {
    case "network":
      return <NetworkRenderer {...props} />;   // ← STEP 2
    default:
      return <BasicRenderer {...props} />;
  }
}
```

Poi `/display?renderer=network`, e si torna a `basic` con un tasto se al
soundcheck il WebGL fa i capricci sul portatile del service.

Backend, API, realtime e motore **non vanno toccati**. Se ti accorgi di doverli
modificare, fermati: probabilmente c'è un modo migliore.

Idea di partenza: React Three Fiber + `@react-three/drei`, nodi force-directed,
ogni messaggio un nodo che resta e si collega agli altri. `isReplay` serve a
distinguere un nodo che nasce da uno che si riaccende.

---

## Decisioni già prese — non riaprirle senza un motivo nuovo

Sono costate discussione. Il perché di ciascuna è nel README.

| Decisione | In breve |
| --- | --- |
| **Campanella + rilettura** | L'evento realtime non contiene il messaggio, dice solo "c'è qualcosa di nuovo". Rende il polling di riserva lo stesso code path, chiude i buchi dopo una disconnessione e rende inerte un evento falsificato |
| **`/qr` e `/display` sono due rotte** | Non uno stato condiviso. Il QR non può ricomparire perché le due cose non condividono una pagina |
| **Rotazione quando la coda è vuota** | Lo schermo non torna mai nero. I nuovi hanno la precedenza. Un messaggio ritirato esce **anche** dallo storico, o tornerebbe a schermo dalla rotazione |
| **Dead-man switch** | Il polling di `/admin` **è** il segnale di presenza dell'operatore. Nessun endpoint dedicato, e non ci si può dichiarare presenti senza esserlo. Guida solo la decisione al momento dell'arrivo (`decideIntake`); il rilascio dei `clean` già in coda (`shouldAutoRelease`) dipende solo dall'età del messaggio — una scheda `/admin` dimenticata aperta non deve bloccarlo per sempre (2026-09-02) |
| **Tre livelli di filtro** | `clean` / `suspect` / `blocked`. La volgarità leggera in italiano a un concerto rock è entusiasmo: va vista da un umano, non rifiutata |
| **Idempotenza prima del rate limit** | Un rinvio non è un messaggio nuovo. Con l'ordine opposto chi ritocca INVIA su rete instabile riceve 429 e riprova ancora |
| **`status` a 3 valori + `displayed_at`** | "Mostrato" è ortogonale ad "approvato" |
| **Cursore su `released_at`, non `created_at`** | Un messaggio approvato dieci minuti dopo l'invio verrebbe altrimenti saltato per sempre |
| **Turnstile spento di default** | Dipendenza da un CDN esterno nel percorso critico. Su una rete di locale il rischio di indisponibilità è peggiore del rischio bot. Si accende da env in trenta secondi |
| **Rate limit su Postgres, non Redis** | Tre count su indice a questa scala sono rumore. Un vendor in meno |
| **Soglie del rate limit tarate su 350 persone** | Il limite per IP non è un limite per persona: dietro il NAT del locale e il CGNAT degli operatori decine di spettatori condividono un IP (Vercel non pubblica record IPv6, quindi anche i telefoni in IPv6 escono dal NAT64). A 5/10min bastavano sei persone dello stesso operatore per spegnere tutti gli altri. Ora 500 — tetto anti-flood, mai raggiungibile da persone vere — e `0` disattiva l'ambito. Il globale sale a 1000/min perché il traffico legittimo massimo con 350 persone è ~700/min |
| **`max: 0` significa "ambito spento"** | È la lettura che chiunque darebbe alla variabile in `.env`. Con la semantica ingenua (`count >= 0`) significherebbe l'opposto e una svista spegnerebbe la serata al primo messaggio. C'è un test che lo blocca |
| **Timeout su ogni fetch del percorso critico** | Una richiesta appesa non è un errore: nessun `catch` scatta e nessun backoff riparte. Sul display teneva alzato il lock di sincronizzazione e i messaggi nuovi smettevano di arrivare; sul telefono lasciava il pulsante a girare. Con l'abort il fallimento è dichiarato, contato e riprovabile |
| **Liste profanità collassate a runtime** | I transformer di `obscenity` collassano le doppie e l'italiano ne è pieno: senza `collapseRuns` metà dei pattern non aggancerebbe nulla, **in silenzio**. C'è un test che verifica che ogni voce reagisca |
| **`motion` solo su `/display`, non sul form pubblico** | Il form gira su rete cellulare satura al buio: ogni kilobyte in più è un invio in meno che va a buon fine. Le sue animazioni restano CSS puro; il maxischermo, caricato una volta sola su un solo dispositivo, si può permettere una libreria JS |
| **Rotazione "meno mostrato prima"** | Con una canzone lunga e pochi messaggi, un giro mescolato non basta a evitare che qualcuno si veda ripetuto molto più degli altri: si pesca sempre tra i mostrati meno volte, mai lo stesso due volte di fila |
| **Chiusura bidirezionale, non un lucchetto** | "Vai alla schermata finale" riusa `status`/`event.ended` già esistenti nello schema; il display rispecchia la verità del server in entrambe le direzioni, cosi' "Rimetti i messaggi a schermo" (doppio tap, non tocca i messaggi) fa ripartire la rotazione da sola, senza reload — necessario sia contro un tap per sbaglio la sera vera, sia per provare l'animazione senza smontare l'evento di test. Rinominato da "Chiudi/Riapri la serata" (2026-09-02): può servire anche a metà concerto, non solo sull'ultimo brano |
| **Frase di chiusura in DB, non solo in `NEXT_PUBLIC_CLOSING_PHRASE`** (2026-09-02) | `EventRecord.closingPhrase` (nullable, `null` = usa il default applicativo), editabile da `/admin/settings`, viaggia nello stesso payload `getFeed` di `ended` — stesso modello "campanella + rilettura", nessun nuovo canale |

---

## Come muoversi nel codice

```
src/lib/domain/     logica pura: zero I/O, zero React. Qui vivono le regole
src/lib/db/         memory.ts e supabase.ts dietro un'unica interfaccia
src/lib/display/    engine.ts (reducer puro) · useMessageStream · timing
src/lib/service/    orchestrazione, usata sia dalle route sia dagli script
src/app/api/        solo HTTP, nessuna logica di prodotto
```

Regola: **`lib/domain` non importa niente** — né React, né Next, né Supabase.
Se ti serve importarci qualcosa, quasi sempre il codice va da un'altra parte.

Tutti i parametri regolabili stanno in `config.ts` / `config.public.ts`, non
sparsi nel codice. `.env.example` li documenta tutti.

```bash
npm run dev         # gira senza account e senza Docker
npm test            # 122 test, ~300 ms
npm run typecheck
npm run lint
npm run burst -- --count 50 --window 5    # da guardare a schermo
npm run qr -- --url https://... --out qr.svg
```

---

## Un'ultima cosa

Il progetto **non è ancora un repository git**. Prima di rimetterci le mani:

```bash
git init && git add -A && git commit -m "STEP 1: MVP completo"
```
