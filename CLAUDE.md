@AGENTS.md

# Live Audience Messages

Web app real-time per concerti: il pubblico scrive dal telefono via QR code, i
messaggi compaiono sul maxischermo. Prima serata **fine ottobre 2026**.

**Prima di lavorare su questo progetto leggi [NEXT_STEPS.md](NEXT_STEPS.md).**
Contiene lo stato reale, l'ordine dei prossimi blocchi, cosa non è ancora stato
verificato, e una tabella di decisioni già prese da non riaprire.
Il [README.md](README.md) spiega architettura e scelte tecniche.

Due regole del progetto che non emergono leggendo un file alla volta:

- `src/lib/domain/` è logica pura: non importa React, né Next, né Supabase.
  Se ti serve importarci qualcosa, il codice va quasi sempre da un'altra parte.
- Ogni parametro regolabile sta in `config.ts` / `config.public.ts`, non
  sparso nel codice. `.env.example` li documenta tutti.

Priorità dichiarata dal committente: **AFFIDABILITÀ > SEMPLICITÀ > PERFORMANCE > ESTETICA.**
Il sistema gira una sera sola, davanti a centinaia di persone, senza possibilità
di hotfix. Preferisci sempre la soluzione che degrada invece di quella che
ottimizza.
