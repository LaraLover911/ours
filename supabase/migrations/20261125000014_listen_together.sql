-- ours. — Listen Together: shared rooms with one queue and one clock.
-- The room row is the single source of truth for playback: which item is
-- current, whether it plays, and the position at a server timestamp
-- (base_pos_ms at base_at). Players on each device follow that clock and correct
-- their drift. Every change goes through listen_control(), a small state machine.

create table if not exists public.listening_rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'Unser Raum' check (char_length(btrim(name)) between 1 and 60),
  created_by    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  current_item  uuid,
  status        text not null default 'idle' check (status in ('idle', 'playing', 'paused')),
  base_pos_ms   int not null default 0 check (base_pos_ms >= 0),
  base_at       timestamptz not null default now(),
  version       int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.listening_rooms enable row level security;
create policy "listen rooms: members read" on public.listening_rooms for select to authenticated using (public.is_member());
create policy "listen rooms: members delete" on public.listening_rooms for delete to authenticated using (public.is_member());
revoke insert, update on public.listening_rooms from anon, authenticated;

create table if not exists public.listening_room_members (
  room_id       uuid not null references public.listening_rooms (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.listening_room_members enable row level security;
create policy "listen members: members read" on public.listening_room_members for select to authenticated using (public.is_member());
revoke insert, update, delete on public.listening_room_members from anon, authenticated;

create table if not exists public.listening_queue (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.listening_rooms (id) on delete cascade,
  sort         int not null,
  provider     text not null check (provider in ('youtube', 'spotify')),
  ref          text not null,
  title        text not null check (char_length(title) between 1 and 200),
  artist       text check (char_length(artist) <= 200),
  thumb        text check (thumb is null or (thumb ~ '^https://' and char_length(thumb) <= 500)),
  duration_ms  int check (duration_ms between 1000 and 14400000),
  dedication   text check (char_length(dedication) <= 280),
  added_by     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  check (
    (provider = 'youtube' and ref ~ '^[A-Za-z0-9_-]{11}$')
    or (provider = 'spotify' and ref ~ '^spotify:(track|episode):[A-Za-z0-9]{22}$')
  )
);
alter table public.listening_queue enable row level security;
create index if not exists listening_queue_room on public.listening_queue (room_id, sort);
create policy "listen queue: members read" on public.listening_queue for select to authenticated using (public.is_member());
revoke insert, update, delete on public.listening_queue from anon, authenticated;

create table if not exists public.listening_history (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid references public.listening_rooms (id) on delete set null,
  provider     text not null,
  ref          text not null,
  title        text not null,
  artist       text,
  thumb        text,
  dedication   text,
  added_by     uuid references public.profiles (id) on delete set null,
  started_at   timestamptz not null,
  ended_at     timestamptz not null default now(),
  listened_ms  int not null default 0,
  reason       text not null check (reason in ('ended', 'skipped'))
);
alter table public.listening_history enable row level security;
create index if not exists listening_history_recent on public.listening_history (ended_at desc);
create policy "listen history: members read" on public.listening_history for select to authenticated using (public.is_member());
create policy "listen history: members delete" on public.listening_history for delete to authenticated using (public.is_member());
revoke insert, update on public.listening_history from anon, authenticated;

-- Spotify account info shown in the app (never tokens; those are encrypted in integration_tokens).
create table if not exists public.spotify_connections (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  spotify_user_id  text not null check (char_length(spotify_user_id) <= 100),
  display_name     text check (char_length(display_name) <= 120),
  product          text check (char_length(product) <= 30),
  connected_at     timestamptz not null default now()
);
alter table public.spotify_connections enable row level security;
create policy "spotify: members read" on public.spotify_connections for select to authenticated using (public.is_member());
create policy "spotify: owner removes" on public.spotify_connections for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.spotify_connections from anon, authenticated;

create or replace function public.spotify_save(p_user text, p_name text, p_product text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  insert into public.spotify_connections (user_id, spotify_user_id, display_name, product)
  values (auth.uid(), left(p_user, 100), left(p_name, 120), left(p_product, 30))
  on conflict (user_id) do update set spotify_user_id = excluded.spotify_user_id, display_name = excluded.display_name,
    product = excluded.product, connected_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Clock helpers
-- ---------------------------------------------------------------------------
create or replace function public.listen_pos(r public.listening_rooms, dur int)
returns int
language sql stable set search_path = ''
as $$
  select greatest(0, least(
    coalesce(dur, 2147483647),
    case when r.status = 'playing'
      then r.base_pos_ms + (extract(epoch from (now() - r.base_at)) * 1000)::int
      else r.base_pos_ms end));
$$;

create or replace function public.listen_touch(p_room uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.listening_room_members (room_id, user_id) values (p_room, auth.uid())
  on conflict (room_id, user_id) do update set last_seen_at = now();
$$;

-- ---------------------------------------------------------------------------
-- API
-- ---------------------------------------------------------------------------
create or replace function public.listen_create(p_name text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  if (select count(*) from public.listening_rooms where created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Zu viele neue Räume. Bitte warte kurz.';
  end if;
  insert into public.listening_rooms (name, created_by) values (coalesce(nullif(btrim(p_name), ''), 'Unser Raum'), auth.uid())
  returning id into new_id;
  perform public.listen_touch(new_id);
  perform public.log_activity(auth.uid(), 'listen', new_id::text, 'hat Listen Together gestartet');
  return new_id;
end;
$$;

create or replace function public.listen_add(p_room uuid, p_provider text, p_ref text, p_title text, p_artist text, p_thumb text, p_duration_ms int, p_dedication text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  r public.listening_rooms;
  new_id uuid;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  select * into r from public.listening_rooms where id = p_room for update;
  if not found then raise exception 'Raum nicht gefunden'; end if;
  if (select count(*) from public.listening_queue where room_id = p_room) >= 200 then raise exception 'Die Warteschlange ist voll'; end if;
  insert into public.listening_queue (room_id, sort, provider, ref, title, artist, thumb, duration_ms, dedication)
  values (p_room, coalesce((select max(sort) from public.listening_queue where room_id = p_room), 0) + 1,
          p_provider, p_ref, left(btrim(p_title), 200), left(nullif(btrim(p_artist), ''), 200),
          case when p_thumb ~ '^https://' then left(p_thumb, 500) end,
          case when p_duration_ms between 1000 and 14400000 then p_duration_ms end,
          left(nullif(btrim(p_dedication), ''), 280))
  returning id into new_id;
  if r.current_item is null then
    update public.listening_rooms set current_item = new_id, status = 'paused', base_pos_ms = 0, base_at = now(),
      version = version + 1, updated_at = now() where id = p_room;
  else
    update public.listening_rooms set version = version + 1, updated_at = now() where id = p_room;
  end if;
  perform public.listen_touch(p_room);
  return new_id;
end;
$$;

-- The state machine. Actions: play, pause, seek, next, jump (to a queued item).
-- p_expect: the item the caller believes is current. If it is not (the partner
-- already skipped), next/seek are ignored so a song is never skipped twice.
create or replace function public.listen_control(p_room uuid, p_action text, p_pos_ms int default null, p_expect uuid default null, p_item uuid default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.listening_rooms;
  cur public.listening_queue;
  nxt uuid;
  pos int;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  select * into r from public.listening_rooms where id = p_room for update;
  if not found then raise exception 'Raum nicht gefunden'; end if;
  select * into cur from public.listening_queue where id = r.current_item;
  pos := public.listen_pos(r, cur.duration_ms);

  if p_expect is not null and p_expect is distinct from r.current_item and p_action in ('next', 'seek', 'ended') then
    return jsonb_build_object('ignored', true, 'version', r.version, 'server_time', now());
  end if;

  case p_action
    when 'play' then
      if cur.id is null then raise exception 'Die Warteschlange ist leer'; end if;
      if cur.duration_ms is not null and pos >= cur.duration_ms - 500 then pos := 0; end if;
      r.status := 'playing'; r.base_pos_ms := pos; r.base_at := now();
    when 'pause' then
      if r.status <> 'playing' then
        return jsonb_build_object('ignored', true, 'version', r.version, 'server_time', now());
      end if;
      r.status := 'paused'; r.base_pos_ms := pos; r.base_at := now();
    when 'seek' then
      if cur.id is null or p_pos_ms is null or p_pos_ms < 0 then raise exception 'Ungültige Position'; end if;
      r.base_pos_ms := least(p_pos_ms, coalesce(cur.duration_ms, p_pos_ms)); r.base_at := now();
    when 'next', 'ended', 'jump' then
      if cur.id is not null then
        insert into public.listening_history (room_id, provider, ref, title, artist, thumb, dedication, added_by, started_at, listened_ms, reason)
        values (r.id, cur.provider, cur.ref, cur.title, cur.artist, cur.thumb, cur.dedication, cur.added_by,
                now() - make_interval(secs => pos / 1000.0), pos, case when p_action = 'ended' then 'ended' else 'skipped' end);
        delete from public.listening_queue where id = cur.id;
      end if;
      if p_action = 'jump' then
        select id into nxt from public.listening_queue where id = p_item and room_id = r.id;
        if nxt is null then raise exception 'Dieser Song ist nicht in der Warteschlange'; end if;
      else
        select id into nxt from public.listening_queue where room_id = r.id order by sort limit 1;
      end if;
      r.current_item := nxt; r.base_pos_ms := 0; r.base_at := now();
      r.status := case when nxt is null then 'idle' when r.status = 'idle' then 'paused' when p_action = 'jump' then 'playing' else r.status end;
    else
      raise exception 'Ungültige Aktion';
  end case;

  update public.listening_rooms set current_item = r.current_item, status = r.status, base_pos_ms = r.base_pos_ms,
    base_at = r.base_at, version = version + 1, updated_at = now()
  where id = r.id returning version into r.version;
  perform public.listen_touch(p_room);
  return jsonb_build_object('version', r.version, 'status', r.status, 'server_time', now());
end;
$$;

create or replace function public.listen_remove(p_item uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  q public.listening_queue;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  select * into q from public.listening_queue where id = p_item;
  if not found then return; end if;
  if exists (select 1 from public.listening_rooms where id = q.room_id and current_item = p_item) then
    raise exception 'Der laufende Song kann nur übersprungen werden';
  end if;
  delete from public.listening_queue where id = p_item;
  update public.listening_rooms set version = version + 1, updated_at = now() where id = q.room_id;
end;
$$;

create or replace function public.listen_move(p_item uuid, p_dir int)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  q public.listening_queue;
  other public.listening_queue;
  cur uuid;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  select * into q from public.listening_queue where id = p_item;
  if not found then return; end if;
  select current_item into cur from public.listening_rooms where id = q.room_id for update;
  select * into other from public.listening_queue
  where room_id = q.room_id and id <> coalesce(cur, '00000000-0000-0000-0000-000000000000'::uuid)
    and case when p_dir < 0 then sort < q.sort else sort > q.sort end
  order by case when p_dir < 0 then -sort else sort end limit 1;
  if other.id is null or q.id = cur then return; end if;
  update public.listening_queue set sort = case when id = q.id then other.sort else q.sort end where id in (q.id, other.id);
  update public.listening_rooms set version = version + 1, updated_at = now() where id = q.room_id;
end;
$$;

-- The real length becomes known once a player loaded the track.
create or replace function public.listen_set_duration(p_item uuid, p_ms int)
returns void
language sql security definer set search_path = ''
as $$
  update public.listening_queue set duration_ms = p_ms
  where id = p_item and duration_ms is null and p_ms between 1000 and 14400000 and public.is_member();
$$;

create or replace function public.listen_touch_room(p_room uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  perform public.listen_touch(p_room);
end;
$$;

create or replace function public.listen_stats()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'songs', (select count(*) from public.listening_history where listened_ms >= 30000),
    'minutes', (select coalesce(sum(listened_ms), 0) / 60000 from public.listening_history),
    'top', coalesce((select jsonb_agg(t) from (
        select title, artist, count(*) as plays from public.listening_history where listened_ms >= 30000
        group by title, artist order by count(*) desc, max(ended_at) desc limit 5) t), '[]'::jsonb),
    'by_person', coalesce((select jsonb_object_agg(added_by, n) from (
        select added_by, count(*) as n from public.listening_history where added_by is not null group by added_by) b), '{}'::jsonb),
    'dedications', (select count(*) from public.listening_history where dedication is not null)
  ) where public.is_member();
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'spotify_save(text, text, text)', 'listen_create(text)', 'listen_add(uuid, text, text, text, text, text, int, text)',
    'listen_control(uuid, text, int, uuid, uuid)', 'listen_remove(uuid)', 'listen_move(uuid, int)',
    'listen_set_duration(uuid, int)', 'listen_touch_room(uuid)', 'listen_stats()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke execute on function public.listen_touch(uuid) from public, anon, authenticated;
  revoke execute on function public.listen_pos(public.listening_rooms, int) from public, anon, authenticated;
end $$;

drop trigger if exists push_listen on public.listening_rooms;
create trigger push_listen after insert on public.listening_rooms
  for each row execute function public.push_on_insert('listen');

do $$
declare
  t text;
begin
  foreach t in array array['listening_rooms', 'listening_queue', 'listening_room_members'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
