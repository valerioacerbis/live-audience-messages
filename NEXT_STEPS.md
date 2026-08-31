# Prossimi passi

Documento di ripresa. Scritto per essere letto da zero: chi riparte non ha il
contesto della conversazione in cui il progetto è nato.

Leggi prima il [README](README.md) — architettura, scelte e RUNBOOK stanno lì.
Questo file dice solo **cosa resta da fare e in che ordine**.

**Data della prima serata: fine ottobre 2026.** È il vincolo che ordina tutto.

---

## Dove siamo

**STEP 1 completo, Supabase collegato e app già in deploy di produzione su
Vercel.** Non più solo locale: `.env.local` gira con `DB_DRIVER=supabase` e
`NEXT_PUBLIC_REALTIME_DRIVER=supabase`, il progetto Vercel
(`live-audience-messages`) ha tutte le env var di produzione impostate, e ci
sono deploy Production recenti.

**Novità di questa sessione (display + form pubblico), da vedere su schermo
vero nel Blocco B:**

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

**Verificato davvero:**

- 98 test (`npm test`), typecheck strict, lint — tutti puliti dopo le
  modifiche sopra (build non ri-verificato in questa sessione)
- Flusso completo via HTTP: invio → moderazione → display, cursore ordinato, zero duplicati
- Burst di 50 messaggi in 5s: 51 nel feed, 0 doppioni, ordine corretto
- Dead-man switch end-to-end: operatore presente → coda; operatore sparisce → i
  `clean` escono da soli, i `suspect` restano fermi
- Idempotenza: 3 invii identici → 1 riga nel DB, stesso id restituito
- Rate limit (429), payload oversize (413), content-type errato (415), admin senza token (401)
- Accumulo su `/qr` → apertura di `/display` → l'arretrato parte in ordine
- Login admin: `/admin?k=…` → 307 → 303 con cookie httpOnly → 200
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
- [ ] Messaggio da 120 caratteri: entra nello schermo senza tagliarsi
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

Warm-up per la serata (su piano Hobby i cron Vercel girano una volta al
giorno, quindi `vercel.json` non ne contiene): puntare un pinger esterno
gratuito su `/api/health` ogni 5 minuti nelle ore dell'evento.

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

Da qui escono i bug veri. Lasciare tempo per sistemarli.

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
| **Dead-man switch** | Il polling di `/admin` **è** il segnale di presenza dell'operatore. Nessun endpoint dedicato, e non ci si può dichiarare presenti senza esserlo |
| **Tre livelli di filtro** | `clean` / `suspect` / `blocked`. La volgarità leggera in italiano a un concerto rock è entusiasmo: va vista da un umano, non rifiutata |
| **Idempotenza prima del rate limit** | Un rinvio non è un messaggio nuovo. Con l'ordine opposto chi ritocca INVIA su rete instabile riceve 429 e riprova ancora |
| **`status` a 3 valori + `displayed_at`** | "Mostrato" è ortogonale ad "approvato" |
| **Cursore su `released_at`, non `created_at`** | Un messaggio approvato dieci minuti dopo l'invio verrebbe altrimenti saltato per sempre |
| **Turnstile spento di default** | Dipendenza da un CDN esterno nel percorso critico. Su una rete di locale il rischio di indisponibilità è peggiore del rischio bot. Si accende da env in trenta secondi |
| **Rate limit su Postgres, non Redis** | Tre count su indice a questa scala sono rumore. Un vendor in meno |
| **Liste profanità collassate a runtime** | I transformer di `obscenity` collassano le doppie e l'italiano ne è pieno: senza `collapseRuns` metà dei pattern non aggancerebbe nulla, **in silenzio**. C'è un test che verifica che ogni voce reagisca |
| **`motion` solo su `/display`, non sul form pubblico** | Il form gira su rete cellulare satura al buio: ogni kilobyte in più è un invio in meno che va a buon fine. Le sue animazioni restano CSS puro; il maxischermo, caricato una volta sola su un solo dispositivo, si può permettere una libreria JS |
| **Rotazione "meno mostrato prima"** | Con una canzone lunga e pochi messaggi, un giro mescolato non basta a evitare che qualcuno si veda ripetuto molto più degli altri: si pesca sempre tra i mostrati meno volte, mai lo stesso due volte di fila |

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
npm test            # 98 test, ~200 ms
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
