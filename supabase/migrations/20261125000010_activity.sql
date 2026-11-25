-- ours. — "Our Activity": an opt-in timeline of what each of you did.
-- Events are written only by the database (triggers / RPCs), only for a person
-- who turned the feed on, and never for private things (private diary entries,
-- secret studio surprises).

alter table public.profiles
  add column if not exists share_activity_feed boolean not null default false;
grant update (share_activity_feed) on public.profiles to authenticated;

create table if not exists public.activity_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('online', 'message', 'memory', 'game', 'diary', 'letter', 'date', 'challenge', 'call', 'pet', 'listen')),
  ref_id      text check (char_length(ref_id) <= 80),
  summary     text not null check (char_length(summary) <= 160),
  created_at  timestamptz not null default now()
);
alter table public.activity_events enable row level security;
create index if not exists activity_events_created on public.activity_events (created_at desc);

create policy "activity: members read" on public.activity_events
  for select to authenticated using (public.is_member());
create policy "activity: owner deletes" on public.activity_events
  for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.activity_events from anon, authenticated;

create or replace function public.log_activity(actor uuid, event_kind text, ref text, text_summary text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if actor is null or not exists (select 1 from public.profiles where id = actor and share_activity_feed) then
    return; -- opt-in only
  end if;
  -- Chatty events are folded: one entry per 30 minutes (per conversation for messages).
  if event_kind in ('message', 'online') and exists (
    select 1 from public.activity_events
    where user_id = actor and kind = event_kind and coalesce(ref_id, '') = coalesce(ref, '')
      and created_at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  insert into public.activity_events (user_id, kind, ref_id, summary)
  values (actor, event_kind, left(ref, 80), left(text_summary, 160));
end;
$$;
revoke execute on function public.log_activity(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.activity_from_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  case tg_table_name
    when 'messages' then
      perform public.log_activity(new.sender_id, 'message', new.conversation_id::text, 'hat Nachrichten geschrieben');
    when 'memories' then
      perform public.log_activity(new.created_by, 'memory', new.id::text, 'hat eine Erinnerung hinzugefügt: ' || left(new.title, 80));
    when 'diary_entries' then
      if new.visibility = 'ours' then
        perform public.log_activity(new.author_id, 'diary', new.id::text, 'hat einen Tagebucheintrag geteilt');
      end if;
    when 'love_letters' then
      perform public.log_activity(new.author_id, 'letter', new.id::text, 'hat einen Brief geschrieben');
    when 'date_ideas' then
      if tg_op = 'INSERT' then
        perform public.log_activity(new.created_by, 'date',
          new.id::text, case when new.status = 'geplant' then 'hat ein Date geplant: ' else 'hat eine Date-Idee notiert: ' end || left(new.title, 80));
      elsif new.status = 'geplant' and old.status is distinct from 'geplant' then
        perform public.log_activity(auth.uid(), 'date', new.id::text || ':planned', 'hat ein Date geplant: ' || left(new.title, 80));
      end if;
    when 'calls' then
      if new.status = 'ended' and new.connected_at is not null and old.status is distinct from 'ended' then
        perform public.log_activity(new.caller_id, 'call', new.id::text,
          'hat angerufen (' || greatest(1, round(extract(epoch from (new.ended_at - new.connected_at)) / 60))::int || ' Min.)');
      end if;
  end case;
  return new;
end;
$$;

drop trigger if exists activity_messages on public.messages;
create trigger activity_messages after insert on public.messages for each row execute function public.activity_from_row();
drop trigger if exists activity_memories on public.memories;
create trigger activity_memories after insert on public.memories for each row execute function public.activity_from_row();
drop trigger if exists activity_diary on public.diary_entries;
create trigger activity_diary after insert on public.diary_entries for each row execute function public.activity_from_row();
drop trigger if exists activity_letters on public.love_letters;
create trigger activity_letters after insert on public.love_letters for each row execute function public.activity_from_row();
drop trigger if exists activity_dates on public.date_ideas;
create trigger activity_dates after insert or update of status on public.date_ideas for each row execute function public.activity_from_row();
drop trigger if exists activity_calls on public.calls;
create trigger activity_calls after update of status on public.calls for each row execute function public.activity_from_row();

-- "online" events: when someone comes back after 30+ minutes away.
create or replace function public.activity_online()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.device_sessions
    where user_id = new.user_id and id <> new.id and last_heartbeat_at > now() - interval '30 minutes'
  ) and (tg_op = 'INSERT' or old.last_heartbeat_at < now() - interval '30 minutes') then
    perform public.log_activity(new.user_id, 'online', null, 'ist online gekommen');
  end if;
  return new;
end;
$$;
drop trigger if exists activity_device_online on public.device_sessions;
create trigger activity_device_online after insert or update of last_heartbeat_at on public.device_sessions
  for each row execute function public.activity_online();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
end $$;
