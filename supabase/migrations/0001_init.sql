-- Live Audience Messages — schema iniziale
--
-- Note di progetto:
-- * `status` ha TRE valori, non quattro: "mostrato" e' ortogonale ad
--   "approvato" e vive in `displayed_at`. Mettere `displayed` dentro `status`
--   farebbe perdere l'informazione di approvazione nel momento in cui il
--   messaggio va in onda.
-- * `released_at` e' il cursore del display, non `created_at`: un messaggio
--   approvato dieci minuti dopo l'invio deve comunque arrivare a schermo, e
--   con un cursore su `created_at` verrebbe saltato per sempre.
-- * `ip_hash` e' un hash con salt. L'IP in chiaro non serve a nulla qui.

create extension if not exists "pgcrypto";

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

create table if not exists public.events (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  status                 text not null default 'live'
                           check (status in ('draft', 'live', 'ended')),
  moderation_mode        text not null default 'assisted'
                           check (moderation_mode in ('manual', 'assisted', 'auto')),
  -- Dead-man switch: ultimo heartbeat ricevuto da /admin.
  operator_last_seen_at  timestamptz,
  -- Panic button: nulla rilasciato prima di questo istante torna a schermo.
  cleared_at             timestamptz,
  created_at             timestamptz not null default now(),
  ended_at               timestamptz
);

/* ------------------------------------------------------------------ */
/* messages                                                            */
/* ------------------------------------------------------------------ */

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  body           text not null check (length(body) between 1 and 2000),
  author_name    text check (author_name is null or length(author_name) <= 200),
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  filter_verdict text not null default 'clean'
                   check (filter_verdict in ('clean', 'suspect', 'blocked')),
  reject_reason  text,
  created_at     timestamptz not null default now(),
  released_at    timestamptz,
  moderated_at   timestamptz,
  moderated_by   text,
  displayed_at   timestamptz,
  ip_hash        text not null,
  session_id     uuid not null,
  client_msg_id  uuid not null
);

-- Idempotenza: e' questo indice a impedire il doppione sul maxischermo
-- quando la risposta si perde e l'utente ritocca INVIA.
create unique index if not exists messages_client_msg_id_uniq
  on public.messages (event_id, client_msg_id);

-- Cursore del display.
create index if not exists messages_release_cursor_idx
  on public.messages (event_id, released_at, id)
  where status = 'approved';

-- Coda di moderazione.
create index if not exists messages_status_idx
  on public.messages (event_id, status, created_at);

-- Rate limiting.
create index if not exists messages_ip_hash_idx on public.messages (event_id, ip_hash, created_at);
create index if not exists messages_session_idx on public.messages (event_id, session_id, created_at);

/* ------------------------------------------------------------------ */
/* RLS: il browser non parla mai direttamente col database.            */
/* Tutto passa dalle API route con la service role key, che bypassa    */
/* le policy. Nessuna policy definita = nessun accesso con anon key.   */
/* ------------------------------------------------------------------ */

alter table public.events   enable row level security;
alter table public.messages enable row level security;

/* ------------------------------------------------------------------ */
/* insert_message_idempotent                                           */
/*                                                                     */
/* Inserisce, oppure restituisce il messaggio gia' presente con lo     */
/* stesso client_msg_id. In una sola andata e ritorno e senza race:    */
/* un read-then-write dall'applicazione, sotto burst, produrrebbe      */
/* comunque duplicati.                                                 */
/* ------------------------------------------------------------------ */

create or replace function public.insert_message_idempotent(
  p_event_id       uuid,
  p_body           text,
  p_author_name    text,
  p_status         text,
  p_filter_verdict text,
  p_reject_reason  text,
  p_released_at    timestamptz,
  p_moderated_by   text,
  p_ip_hash        text,
  p_session_id     uuid,
  p_client_msg_id  uuid
)
returns table (message public.messages, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.messages;
begin
  insert into public.messages (
    event_id, body, author_name, status, filter_verdict, reject_reason,
    released_at, moderated_by, moderated_at, ip_hash, session_id, client_msg_id
  )
  values (
    p_event_id, p_body, p_author_name, p_status, p_filter_verdict, p_reject_reason,
    p_released_at, p_moderated_by,
    case when p_moderated_by is null then null else now() end,
    p_ip_hash, p_session_id, p_client_msg_id
  )
  on conflict (event_id, client_msg_id) do nothing
  returning * into v_row;

  if found then
    return query select v_row, true;
  end if;

  select * into v_row
    from public.messages
   where event_id = p_event_id and client_msg_id = p_client_msg_id;

  return query select v_row, false;
end;
$$;

/* ------------------------------------------------------------------ */
/* release_abandoned  (sweeper del dead-man switch)                    */
/*                                                                     */
/* Libera i messaggi puliti rimasti in coda quando l'operatore, che    */
/* c'era al momento dell'invio, e' poi sparito. Viene chiamata dalla   */
/* GET del display, che gira comunque ogni pochi secondi: zero cron.   */
/* I `suspect` non vengono mai liberati: nessun umano li ha guardati.  */
/* ------------------------------------------------------------------ */

create or replace function public.release_abandoned(
  p_event_id  uuid,
  p_min_age_s integer
)
returns setof public.messages
language sql
security definer
set search_path = public
as $$
  update public.messages
     set status       = 'approved',
         released_at  = now(),
         moderated_at = now(),
         moderated_by = 'auto'
   where event_id       = p_event_id
     and status         = 'pending'
     and filter_verdict = 'clean'
     and created_at <= now() - make_interval(secs => p_min_age_s)
  returning *;
$$;

/* ------------------------------------------------------------------ */
/* Evento di default: il multi-event e' gia' nello schema, ma nello    */
/* STEP 1 basta una riga.                                              */
/* ------------------------------------------------------------------ */

insert into public.events (slug, name)
values ('default', 'Live')
on conflict (slug) do nothing;
