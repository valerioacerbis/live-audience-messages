-- Frase della schermata di chiusura, impostabile dall'admin invece che fissa
-- a build time (NEXT_PUBLIC_CLOSING_PHRASE resta il default applicativo).
-- NULL = nessuna sovrascrittura, si usa quel default.

alter table public.events
  add column if not exists closing_phrase text;
