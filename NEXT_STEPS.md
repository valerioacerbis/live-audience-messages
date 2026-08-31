# Prossimi passi

Documento di ripresa. Scritto per essere letto da zero: chi riparte non ha il
contesto della conversazione in cui il progetto è nato.

Leggi prima il [README](README.md) — architettura, scelte e RUNBOOK stanno lì.
Questo file dice solo **cosa resta da fare e in che ordine**.

**Data della prima serata: fine ottobre 2026.** È il vincolo che ordina tutto.

---

## Dove siamo

STEP 1 completo e funzionante in locale con i driver di sviluppo
(`DB_DRIVER=memory`, `NEXT_PUBLIC_REALTIME_DRIVER=polling`).

**Verificato davvero:**

- 86 test (`npm test`), typecheck strict, lint, build — tutti puliti
- Flusso completo via HTTP: invio → moderazione → display, cursore ordinato, zero duplicati
- Burst di 50 messaggi in 5s: 51 nel feed, 0 doppioni, ordine corretto
- Dead-man switch end-to-end: operatore presente → coda; operatore sparisce → i
  `clean` escono da soli, i `suspect` restano fermi
- Idempotenza: 3 invii identici → 1 riga nel DB, stesso id restituito
- Rate limit (429), payload oversize (413), content-type errato (415), admin senza token (401)
- Accumulo su `/qr` → apertura di `/display` → l'arretrato parte in ordine
- Login admin: `/admin?k=…` → 307 → 303 con cookie httpOnly → 200

**Mai verificato — sono i primi due blocchi qui sotto:**

- Il driver Supabase contro un'istanza reale (schema e codice scritti, mai eseguiti)
- La resa visiva di `/display` e `/qr` in un browser vero

---

## Blocco A — Supabase (bloccante, ~1 ora)

Senza questo non si può deployare: su Vercel ogni funzione ha il proprio
processo e il driver `memory` si rifiuta di partire
([`src/lib/db/index.ts`](src/lib/db/index.ts)).

1. Creare un progetto su supabase.com — piano gratuito, **regione EU
   (Frankfurt)**, per stare vicino a `fra1` di Vercel.
2. SQL Editor → incollare tutto
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Compilare `.env.local` come descritto nel README (§"Passare a Supabase").
4. `npm run dev` e ripetere le verifiche del blocco "Dove siamo".

### I tre punti che possono rompersi, in ordine di probabilità

**1. La forma di ritorno di `insert_message_idempotent`.**
La funzione SQL dichiara `returns table (message public.messages, created boolean)`.
Il driver in [`supabase.ts`](src/lib/db/supabase.ts) si aspetta
`[{ message: {...}, created: bool }]`. PostgREST potrebbe appiattire la riga
composita in modo diverso. **Verificare per prima cosa**, con un `console.log`
del `data` grezzo. Se la forma non torna, l'alternativa più semplice è cambiare
la funzione in `returns setof public.messages` più una colonna `was_created`
piatta, invece di combattere con il tipo composito.

**2. Il broadcast realtime.**
[`publish.ts`](src/lib/realtime/publish.ts) chiama
`POST {SUPABASE_URL}/realtime/v1/api/broadcast`. Da verificare: che l'endpoint
accetti la service role key, e che il canale pubblico non richieda
autorizzazione lato client. Test: aprire `/display` con
`NEXT_PUBLIC_REALTIME_DRIVER=supabase`, inviare un messaggio, e controllare che
il pallino in basso a destra sia **verde** e che il messaggio arrivi in
~150 ms invece di ~2 s.

Se il broadcast non funziona, **non è un blocco per la serata**: il polling
copre tutto, con 2 secondi di latenza. Lasciare `polling` e riprovare con calma.

**3. `release_abandoned` e i tipi timestamptz.**
Verificare che lo sweeper rilasci davvero. Test veloce: `OPERATOR_TIMEOUT_MS=3000
AUTO_RELEASE_DELAY_MS=2000 npm run dev`, inviare un messaggio pulito senza mai
aprire `/admin`, e controllare che dopo ~3 s compaia in
`GET /api/messages`.

> **Attenzione durante i test:** se hai `/admin` aperto in una scheda, il suo
> polling ti registra come operatore presente e i messaggi restano
> correttamente in coda. Non è un bug. Per testare "senza operatore" chiudi la
> scheda, oppure usa un `eventSlug` diverso (`?eventSlug=prova`).

---

## Blocco B — Verifica visiva (~30 minuti)

Mai fatta. La logica è coperta dai test, il rendering no.

Aprire `/qr` e `/display` su uno schermo grande e controllare:

- [ ] `/qr`: il QR è leggibile da **5-6 metri**, con le luci accese. Se no,
      aumentare la dimensione in [`QrScreen.tsx`](src/components/display/QrScreen.tsx)
      (`min(46vh, 46vw)`)
- [ ] `/display`: animazione di ingresso e uscita fluide, nessuno scatto
- [ ] Messaggio da 280 caratteri: entra nello schermo senza tagliarsi
      (`text-[clamp(2.5rem,5.5vw,7rem)]` in [`BasicRenderer.tsx`](src/components/display/renderers/BasicRenderer.tsx))
- [ ] Messaggio da 3 caratteri: non sembra sperduto
- [ ] Nome lungo, emoji, testo tutto maiuscolo
- [ ] Rotazione: con 2-3 messaggi, girano senza ripetere due volte di fila
- [ ] Con **un solo** messaggio: resta fermo, non lampeggia
- [ ] Fullscreen ("Entra in scena") e wake lock: lo schermo non si spegne in 15 minuti
- [ ] Il pallino di stato è invisibile da lontano ma leggibile da vicino
- [ ] `/admin` su un telefono vero: i bottoni si centrano al buio con una mano

Comando utile per riempire lo schermo:
```bash
npm run burst -- --count 20 --window 4
```

---

## Blocco C — Deploy su Vercel (~30 minuti)

1. `npx vercel` e collegare il progetto.
2. Variabili d'ambiente in *Settings → Environment Variables* (le stesse di
   `.env.local`, con `IP_HASH_SALT` e `ADMIN_TOKEN` generati con
   `openssl rand -hex 32`).
3. Verificare che `/api/health` risponda `ok: true` con
   `drivers.db = "supabase"`.
4. Controllo intenzionale: provare un deploy **senza** `DB_DRIVER=supabase` e
   verificare che l'app fallisca con il messaggio esplicito invece di partire
   con il driver sbagliato.
5. Generare il QR definitivo:
   `npm run qr -- --url https://<dominio> --out qr.svg`
6. Warm-up: puntare un pinger esterno gratuito su `/api/health` ogni 5 minuti
   nelle ore dell'evento (su piano Hobby i cron Vercel girano una volta al
   giorno, quindi `vercel.json` non ne contiene).

---

## Blocco D — Tre incoerenze note da chiudere

Piccole, ma già scritte nella documentazione come se esistessero.

**D1. Il token dell'evento nel QR non viene validato.**
[`scripts/generate-qr.ts`](scripts/generate-qr.ts) accetta `--token` e lo mette
nell'URL come `?t=`, e il RUNBOOK dice "se il link finisce in giro, cambia il
token e rigenera il QR". Ma **niente controlla `?t=`**: oggi quel parametro è
decorativo.
Due strade oneste: implementarlo (un campo `access_token` su `events`,
controllato in `createMessage`) oppure togliere `--token` dallo script e la
riga dal RUNBOOK. Decidere prima della serata — la seconda va benissimo se ci
si affida a Turnstile.

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
npm test            # 86 test, ~200 ms
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
