-- Distingue i messaggi scritti dal pubblico da quelli pre-scritti che il
-- moderatore inserisce a lotti per riempire la rotazione quando il pubblico
-- scrive poco. Aggiuntiva e non distruttiva: le righe esistenti diventano
-- tutte 'user' col default.

alter table public.messages
  add column if not exists source text not null default 'user'
    check (source in ('user', 'synthetic'));

/* ------------------------------------------------------------------ */
/* insert_message_idempotent — aggiunta di p_source                    */
/*                                                                     */
/* Stessa funzione di 0001_init.sql, con un parametro in piu' che ha    */
/* un default: le chiamate esistenti continuano a funzionare senza      */
/* modifiche.                                                          */
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
  p_client_msg_id  uuid,
  p_source         text default 'user'
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
    released_at, moderated_by, moderated_at, ip_hash, session_id, client_msg_id,
    source
  )
  values (
    p_event_id, p_body, p_author_name, p_status, p_filter_verdict, p_reject_reason,
    p_released_at, p_moderated_by,
    case when p_moderated_by is null then null else now() end,
    p_ip_hash, p_session_id, p_client_msg_id,
    p_source
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
