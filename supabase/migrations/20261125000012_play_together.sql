-- ours. — Play Together: real-time two-player games.
-- Every move goes through public.game_move(), which locks the room, checks whose
-- turn it is and validates the move with the rules of that game. Clients can only
-- read rooms; they can never write a board directly. Hidden information (memory
-- cards, answers that are not revealed yet) lives in game_secrets, which no client
-- can read.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.game_rooms (
  id           uuid primary key default gen_random_uuid(),
  game         text not null check (game in ('tictactoe', 'connect4', 'quiz', 'thisorthat', 'truthordare', 'reaction', 'memory', 'chess', 'guess', 'datechallenge')),
  status       text not null default 'invited' check (status in ('invited', 'active', 'finished', 'declined', 'cancelled')),
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  guest_id     uuid not null references public.profiles (id) on delete cascade,
  state        jsonb not null default '{}'::jsonb,
  turn         uuid,
  winner       uuid,
  result       text check (result in ('win', 'draw', 'coop', 'abandoned')),
  version      int not null default 0,
  rematch_of   uuid references public.game_rooms (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz,
  check (created_by <> guest_id)
);
alter table public.game_rooms enable row level security;
create index if not exists game_rooms_recent on public.game_rooms (updated_at desc);
create policy "games: members read" on public.game_rooms
  for select to authenticated using (public.is_member());
create policy "games: players clear finished games" on public.game_rooms
  for delete to authenticated
  using (auth.uid() in (created_by, guest_id) and status in ('finished', 'declined', 'cancelled'));
revoke insert, update on public.game_rooms from anon, authenticated;

create table if not exists public.game_moves (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references public.game_rooms (id) on delete cascade,
  seq         int not null,
  player      uuid not null references public.profiles (id) on delete cascade,
  move        jsonb not null,
  created_at  timestamptz not null default now(),
  unique (room_id, seq)
);
alter table public.game_moves enable row level security;
create policy "game moves: members read" on public.game_moves
  for select to authenticated using (public.is_member());
revoke insert, update, delete on public.game_moves from anon, authenticated;

create table if not exists public.game_secrets (
  room_id  uuid primary key references public.game_rooms (id) on delete cascade,
  data     jsonb not null default '{}'::jsonb
);
alter table public.game_secrets enable row level security;
revoke all on public.game_secrets from anon, authenticated;

-- Prompts for the party games (generic, nothing about you two is made up).
create table if not exists public.game_content (
  id    int generated always as identity primary key,
  kind  text not null check (kind in ('quiz', 'thisorthat', 'guess', 'truth', 'dare', 'date')),
  body  jsonb not null
);
alter table public.game_content enable row level security;
revoke all on public.game_content from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------
create or replace function public.gm_int(m jsonb, k text)
returns int
language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(m -> k) = 'number' and (m ->> k) ~ '^-?[0-9]{1,6}$' then (m ->> k)::int end;
$$;

create or replace function public.gm_other(r public.game_rooms, uid uuid)
returns uuid
language sql immutable set search_path = ''
as $$
  select case when uid = r.created_by then r.guest_id else r.created_by end;
$$;

create or replace function public.gm_end(r public.game_rooms, who uuid, res text)
returns public.game_rooms
language plpgsql set search_path = ''
as $$
begin
  r.status := 'finished';
  r.winner := who;
  r.result := res;
  r.turn := null;
  r.finished_at := now();
  return r;
end;
$$;

-- Higher score wins, equal is a draw.
create or replace function public.gm_end_by_score(r public.game_rooms)
returns public.game_rooms
language plpgsql set search_path = ''
as $$
declare
  a int := coalesce((r.state -> 'scores' ->> r.created_by::text)::int, 0);
  b int := coalesce((r.state -> 'scores' ->> r.guest_id::text)::int, 0);
begin
  if a = b then
    return public.gm_end(r, null, 'draw');
  end if;
  return public.gm_end(r, case when a > b then r.created_by else r.guest_id end, 'win');
end;
$$;

create or replace function public.gm_add_score(s jsonb, uid uuid, n int default 1)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_set(s, array['scores', uid::text], to_jsonb(coalesce((s -> 'scores' ->> uid::text)::int, 0) + n));
$$;

create or replace function public.gm_draw(content_kind text, n int, not_in int[] default '{}')
returns jsonb
language sql volatile security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(c.body || jsonb_build_object('id', c.id)), '[]'::jsonb)
  from (select id, body from public.game_content where kind = content_kind and not (id = any (not_in)) order by random() limit n) c;
$$;
revoke execute on function public.gm_draw(text, int, int[]) from public, anon, authenticated;

-- Simultaneous answers: stash mine secretly, reveal both once the partner answered.
-- Returns null while waiting, otherwise {creator_id: answer, guest_id: answer}.
create or replace function public.gm_submit(r public.game_rooms, me uuid, answer jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  pending jsonb;
begin
  insert into public.game_secrets (room_id, data) values (r.id, '{}'::jsonb) on conflict (room_id) do nothing;
  select coalesce(data -> 'pending', '{}'::jsonb) into pending from public.game_secrets where room_id = r.id for update;
  if pending ? me::text then
    raise exception 'Du hast schon geantwortet';
  end if;
  pending := pending || jsonb_build_object(me::text, answer);
  if pending ? r.created_by::text and pending ? r.guest_id::text then
    update public.game_secrets set data = data - 'pending' where room_id = r.id;
    return pending;
  end if;
  update public.game_secrets set data = jsonb_set(data, '{pending}', pending) where room_id = r.id;
  return null;
end;
$$;
revoke execute on function public.gm_submit(public.game_rooms, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Chess rules (board: 64 chars, a8 = 0 … h1 = 63, upper case = white, '.' empty)
-- ---------------------------------------------------------------------------
create or replace function public.chess_sq(b text, r int, c int)
returns text
language sql immutable set search_path = ''
as $$
  select case when r between 0 and 7 and c between 0 and 7 then substr(b, r * 8 + c + 1, 1) end;
$$;

create or replace function public.chess_attacked(b text, sq int, by_white boolean)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  r int := sq / 8;
  c int := sq % 8;
  d int[];
  i int;
  p text;
begin
  if by_white then
    if public.chess_sq(b, r + 1, c - 1) = 'P' or public.chess_sq(b, r + 1, c + 1) = 'P' then return true; end if;
  else
    if public.chess_sq(b, r - 1, c - 1) = 'p' or public.chess_sq(b, r - 1, c + 1) = 'p' then return true; end if;
  end if;
  foreach d slice 1 in array array[[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] loop
    if public.chess_sq(b, r + d[1], c + d[2]) = (case when by_white then 'N' else 'n' end) then return true; end if;
  end loop;
  foreach d slice 1 in array array[[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] loop
    if public.chess_sq(b, r + d[1], c + d[2]) = (case when by_white then 'K' else 'k' end) then return true; end if;
    i := 1;
    loop
      p := public.chess_sq(b, r + d[1] * i, c + d[2] * i);
      exit when p is null;
      if p <> '.' then
        if d[1] = 0 or d[2] = 0 then
          if p = any (case when by_white then array['R', 'Q'] else array['r', 'q'] end) then return true; end if;
        else
          if p = any (case when by_white then array['B', 'Q'] else array['b', 'q'] end) then return true; end if;
        end if;
        exit;
      end if;
      i := i + 1;
    end loop;
  end loop;
  return false;
end;
$$;

-- Pseudo-legal target squares of the piece on fsq (castling fully checked).
create or replace function public.chess_targets(b text, fsq int, castling text, ep int)
returns int[]
language plpgsql immutable set search_path = ''
as $$
declare
  p text := substr(b, fsq + 1, 1);
  k text := upper(p);
  white boolean := p ~ '[A-Z]';
  r int := fsq / 8;
  c int := fsq % 8;
  res int[] := '{}';
  t text;
  d int[];
  i int;
  dir int;
  dirs int[];
begin
  if p = '.' then
    return res;
  end if;
  if k = 'P' then
    dir := case when white then -1 else 1 end;
    if public.chess_sq(b, r + dir, c) = '.' then
      res := res || ((r + dir) * 8 + c);
      if r = (case when white then 6 else 1 end) and public.chess_sq(b, r + 2 * dir, c) = '.' then
        res := res || ((r + 2 * dir) * 8 + c);
      end if;
    end if;
    foreach i in array array[-1, 1] loop
      t := public.chess_sq(b, r + dir, c + i);
      if t is not null and ((t <> '.' and (t ~ '[A-Z]') <> white) or (t = '.' and (r + dir) * 8 + c + i = ep)) then
        res := res || ((r + dir) * 8 + c + i);
      end if;
    end loop;
  elsif k in ('N', 'K') then
    dirs := case when k = 'N'
      then array[[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
      else array[[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] end;
    foreach d slice 1 in array dirs loop
      t := public.chess_sq(b, r + d[1], c + d[2]);
      if t is not null and (t = '.' or (t ~ '[A-Z]') <> white) then
        res := res || ((r + d[1]) * 8 + c + d[2]);
      end if;
    end loop;
    if k = 'K' and white and fsq = 60 and not public.chess_attacked(b, 60, false) then
      if strpos(castling, 'K') > 0 and substr(b, 62, 1) = '.' and substr(b, 63, 1) = '.' and substr(b, 64, 1) = 'R'
         and not public.chess_attacked(b, 61, false) and not public.chess_attacked(b, 62, false) then
        res := res || 62;
      end if;
      if strpos(castling, 'Q') > 0 and substr(b, 60, 1) = '.' and substr(b, 59, 1) = '.' and substr(b, 58, 1) = '.' and substr(b, 57, 1) = 'R'
         and not public.chess_attacked(b, 59, false) and not public.chess_attacked(b, 58, false) then
        res := res || 58;
      end if;
    elsif k = 'K' and not white and fsq = 4 and not public.chess_attacked(b, 4, true) then
      if strpos(castling, 'k') > 0 and substr(b, 6, 1) = '.' and substr(b, 7, 1) = '.' and substr(b, 8, 1) = 'r'
         and not public.chess_attacked(b, 5, true) and not public.chess_attacked(b, 6, true) then
        res := res || 6;
      end if;
      if strpos(castling, 'q') > 0 and substr(b, 4, 1) = '.' and substr(b, 3, 1) = '.' and substr(b, 2, 1) = '.' and substr(b, 1, 1) = 'r'
         and not public.chess_attacked(b, 3, true) and not public.chess_attacked(b, 2, true) then
        res := res || 2;
      end if;
    end if;
  else
    dirs := case k
      when 'R' then array[[1, 0], [-1, 0], [0, 1], [0, -1]]
      when 'B' then array[[1, 1], [1, -1], [-1, 1], [-1, -1]]
      else array[[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] end;
    foreach d slice 1 in array dirs loop
      i := 1;
      loop
        t := public.chess_sq(b, r + d[1] * i, c + d[2] * i);
        exit when t is null;
        if t = '.' then
          res := res || ((r + d[1] * i) * 8 + c + d[2] * i);
        else
          if (t ~ '[A-Z]') <> white then
            res := res || ((r + d[1] * i) * 8 + c + d[2] * i);
          end if;
          exit;
        end if;
        i := i + 1;
      end loop;
    end loop;
  end if;
  return res;
end;
$$;

create or replace function public.chess_apply(b text, fsq int, tsq int, promo text, ep int)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  p text := substr(b, fsq + 1, 1);
  k text := upper(p);
  white boolean := p ~ '[A-Z]';
  row0 int := fsq - fsq % 8;
begin
  if k = 'P' and tsq = ep and substr(b, tsq + 1, 1) = '.' then
    b := overlay(b placing '.' from (fsq / 8) * 8 + tsq % 8 + 1 for 1); -- en passant
  end if;
  b := overlay(b placing '.' from fsq + 1 for 1);
  if k = 'P' and tsq / 8 in (0, 7) then
    p := coalesce(lower(promo), 'q');
    if p not in ('q', 'r', 'b', 'n') then p := 'q'; end if;
    if white then p := upper(p); end if;
  end if;
  b := overlay(b placing p from tsq + 1 for 1);
  if k = 'K' and abs(tsq % 8 - fsq % 8) = 2 then
    if tsq % 8 = 6 then
      b := overlay(b placing '.' from row0 + 8 for 1);
      b := overlay(b placing (case when white then 'R' else 'r' end) from row0 + 6 for 1);
    else
      b := overlay(b placing '.' from row0 + 1 for 1);
      b := overlay(b placing (case when white then 'R' else 'r' end) from row0 + 4 for 1);
    end if;
  end if;
  return b;
end;
$$;

create or replace function public.chess_legal(b text, fsq int, tsq int, castling text, ep int, white boolean)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  p text := substr(b, fsq + 1, 1);
  nb text;
begin
  if p = '.' or (p ~ '[A-Z]') <> white or not (tsq = any (public.chess_targets(b, fsq, castling, ep))) then
    return false;
  end if;
  nb := public.chess_apply(b, fsq, tsq, 'q', ep);
  return not public.chess_attacked(nb, strpos(nb, case when white then 'K' else 'k' end) - 1, not white);
end;
$$;

create or replace function public.chess_any_legal(b text, castling text, ep int, white boolean)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  s int;
  t int;
  p text;
begin
  for s in 0..63 loop
    p := substr(b, s + 1, 1);
    continue when p = '.' or (p ~ '[A-Z]') <> white;
    foreach t in array public.chess_targets(b, s, castling, ep) loop
      if not public.chess_attacked(public.chess_apply(b, s, t, 'q', ep),
           strpos(public.chess_apply(b, s, t, 'q', ep), case when white then 'K' else 'k' end) - 1, not white) then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;

create or replace function public.chess_name(sq int)
returns text
language sql immutable set search_path = ''
as $$
  select chr(97 + sq % 8) || (8 - sq / 8)::text;
$$;

-- ---------------------------------------------------------------------------
-- Rules per game. Each takes the locked room, the player and the move and returns
-- the new room (or raises a German error message the app shows as it is).
-- ---------------------------------------------------------------------------
create or replace function public.gp_tictactoe(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql set search_path = ''
as $$
declare
  b text := r.state ->> 'board';
  cell int := public.gm_int(m, 'cell');
  mark text := case when (r.state ->> 'x')::uuid = me then 'X' else 'O' end;
  line int[];
begin
  if r.turn is distinct from me then raise exception 'Du bist nicht dran'; end if;
  if cell is null or cell not between 0 and 8 then raise exception 'Ungültiges Feld'; end if;
  if substr(b, cell + 1, 1) <> '.' then raise exception 'Das Feld ist schon belegt'; end if;
  b := overlay(b placing mark from cell + 1 for 1);
  r.state := r.state || jsonb_build_object('board', b, 'last', cell);
  foreach line slice 1 in array array[[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]] loop
    if substr(b, line[1] + 1, 1) = mark and substr(b, line[2] + 1, 1) = mark and substr(b, line[3] + 1, 1) = mark then
      r.state := r.state || jsonb_build_object('line', to_jsonb(line));
      return public.gm_end(r, me, 'win');
    end if;
  end loop;
  if strpos(b, '.') = 0 then
    return public.gm_end(r, null, 'draw');
  end if;
  r.turn := public.gm_other(r, me);
  return r;
end;
$$;

create or replace function public.gp_connect4(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql set search_path = ''
as $$
declare
  b text := r.state ->> 'board';
  col int := public.gm_int(m, 'col');
  mark text := case when (r.state ->> 'red')::uuid = me then 'R' else 'Y' end;
  row_ int;
  idx int;
  d int[];
  i int;
  cells int[];
begin
  if r.turn is distinct from me then raise exception 'Du bist nicht dran'; end if;
  if col is null or col not between 0 and 6 then raise exception 'Ungültige Spalte'; end if;
  row_ := null;
  for i in reverse 5..0 loop
    if substr(b, i * 7 + col + 1, 1) = '.' then row_ := i; exit; end if;
  end loop;
  if row_ is null then raise exception 'Die Spalte ist voll'; end if;
  idx := row_ * 7 + col;
  b := overlay(b placing mark from idx + 1 for 1);
  r.state := r.state || jsonb_build_object('board', b, 'last', idx);
  foreach d slice 1 in array array[[0, 1], [1, 0], [1, 1], [1, -1]] loop
    cells := array[idx];
    i := 1;
    while row_ + d[1] * i between 0 and 5 and col + d[2] * i between 0 and 6
      and substr(b, (row_ + d[1] * i) * 7 + col + d[2] * i + 1, 1) = mark loop
      cells := cells || ((row_ + d[1] * i) * 7 + col + d[2] * i);
      i := i + 1;
    end loop;
    i := 1;
    while row_ - d[1] * i between 0 and 5 and col - d[2] * i between 0 and 6
      and substr(b, (row_ - d[1] * i) * 7 + col - d[2] * i + 1, 1) = mark loop
      cells := cells || ((row_ - d[1] * i) * 7 + col - d[2] * i);
      i := i + 1;
    end loop;
    if array_length(cells, 1) >= 4 then
      r.state := r.state || jsonb_build_object('line', to_jsonb(cells));
      return public.gm_end(r, me, 'win');
    end if;
  end loop;
  if strpos(b, '.') = 0 then
    return public.gm_end(r, null, 'draw');
  end if;
  r.turn := public.gm_other(r, me);
  return r;
end;
$$;

create or replace function public.gp_memory(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  card int := public.gm_int(m, 'card');
  s jsonb := r.state;
  deck jsonb;
  open_ jsonb := coalesce(s -> 'open', '[]'::jsonb);
  first_ int;
  i int;
begin
  if r.turn is distinct from me then raise exception 'Du bist nicht dran'; end if;
  if card is null or card not between 0 and 15 then raise exception 'Ungültige Karte'; end if;
  select data -> 'deck' into deck from public.game_secrets where room_id = r.id;
  -- A mismatched pair from the last turn is turned face down again first.
  if jsonb_array_length(open_) = 2 then
    for i in 0..1 loop
      if s -> 'owner' -> ((open_ ->> i)::int) = 'null'::jsonb then
        s := jsonb_set(s, array['cards', open_ ->> i], 'null'::jsonb);
      end if;
    end loop;
    open_ := '[]'::jsonb;
  end if;
  if s -> 'owner' -> card <> 'null'::jsonb then raise exception 'Das Paar ist schon gefunden'; end if;
  if open_ @> to_jsonb(card) then raise exception 'Die Karte ist schon offen'; end if;
  s := jsonb_set(s, array['cards', card::text], deck -> card);
  open_ := open_ || to_jsonb(card);
  if jsonb_array_length(open_) = 2 then
    first_ := (open_ ->> 0)::int;
    if deck -> first_ = deck -> card then
      s := jsonb_set(s, array['owner', first_::text], to_jsonb(me));
      s := jsonb_set(s, array['owner', card::text], to_jsonb(me));
      s := public.gm_add_score(s, me);
      open_ := '[]'::jsonb; -- found a pair: same player again
    else
      r.turn := public.gm_other(r, me);
    end if;
  end if;
  s := jsonb_set(s, '{open}', open_);
  r.state := s;
  if not exists (select 1 from jsonb_array_elements(s -> 'owner') o where o = 'null'::jsonb) then
    return public.gm_end_by_score(r);
  end if;
  return r;
end;
$$;
revoke execute on function public.gp_memory(public.game_rooms, uuid, jsonb) from public, anon, authenticated;

create or replace function public.gp_chess(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql set search_path = ''
as $$
declare
  s jsonb := r.state;
  b text := s ->> 'board';
  white boolean := (s ->> 'white')::uuid = me;
  castling text := s ->> 'castling';
  ep int := (s ->> 'ep')::int;
  fsq int := public.gm_int(m, 'from');
  tsq int := public.gm_int(m, 'to');
  promo text := lower(left(coalesce(m ->> 'promo', 'q'), 1));
  p text;
  captured boolean;
  nb text;
  opp_white boolean;
  in_check boolean;
  key text;
  reps int;
  rest text;
  note text;
begin
  if m ? 'offer_draw' then
    if s ->> 'draw_offer' = me::text then raise exception 'Du hast schon Remis angeboten'; end if;
    r.state := s || jsonb_build_object('draw_offer', me);
    return r;
  elsif m ? 'answer_draw' then
    if s ->> 'draw_offer' is null or s ->> 'draw_offer' = me::text then raise exception 'Es gibt kein Remis-Angebot'; end if;
    r.state := s - 'draw_offer';
    if (m ->> 'answer_draw') = 'true' then
      r.state := r.state || jsonb_build_object('reason', 'agreed');
      return public.gm_end(r, null, 'draw');
    end if;
    return r;
  end if;

  if r.turn is distinct from me then raise exception 'Du bist nicht dran'; end if;
  if fsq is null or tsq is null or fsq not between 0 and 63 or tsq not between 0 and 63 then raise exception 'Ungültiger Zug'; end if;
  if (s ->> 'color' = 'w') <> white then raise exception 'Du bist nicht dran'; end if;
  if not public.chess_legal(b, fsq, tsq, castling, ep, white) then raise exception 'Dieser Zug ist nicht erlaubt'; end if;

  p := substr(b, fsq + 1, 1);
  captured := substr(b, tsq + 1, 1) <> '.' or (upper(p) = 'P' and tsq = ep);
  nb := public.chess_apply(b, fsq, tsq, promo, ep);

  if upper(p) = 'K' then
    castling := translate(castling, case when white then 'KQ' else 'kq' end, '');
  end if;
  if 63 in (fsq, tsq) then castling := replace(castling, 'K', ''); end if;
  if 56 in (fsq, tsq) then castling := replace(castling, 'Q', ''); end if;
  if 7 in (fsq, tsq) then castling := replace(castling, 'k', ''); end if;
  if 0 in (fsq, tsq) then castling := replace(castling, 'q', ''); end if;

  opp_white := not white;
  in_check := public.chess_attacked(nb, strpos(nb, case when opp_white then 'K' else 'k' end) - 1, white);
  ep := case when upper(p) = 'P' and abs(tsq - fsq) = 16 then (fsq + tsq) / 2 else -1 end;
  note := public.chess_name(fsq) || case when captured then 'x' else '-' end || public.chess_name(tsq)
    || case when upper(p) = 'P' and tsq / 8 in (0, 7) then '=' || upper(case when promo in ('q', 'r', 'b', 'n') then promo else 'q' end) else '' end;
  key := md5(nb || case when opp_white then 'w' else 'b' end || castling || ep::text);
  reps := coalesce((s -> 'reps' ->> key)::int, 0) + 1;

  s := (s - 'draw_offer') || jsonb_build_object(
    'board', nb,
    'color', case when opp_white then 'w' else 'b' end,
    'castling', castling,
    'ep', ep,
    'half', case when upper(p) = 'P' or captured then 0 else (s ->> 'half')::int + 1 end,
    'last', jsonb_build_array(fsq, tsq),
    'check', in_check,
    'moves', coalesce(s -> 'moves', '[]'::jsonb) || to_jsonb(upper(case when upper(p) = 'P' then '' else p end) || note),
    'reps', coalesce(s -> 'reps', '{}'::jsonb) || jsonb_build_object(key, reps)
  );
  r.state := s;
  r.turn := public.gm_other(r, me);

  if not public.chess_any_legal(nb, castling, ep, opp_white) then
    r.state := r.state || jsonb_build_object('reason', case when in_check then 'checkmate' else 'stalemate' end);
    return case when in_check then public.gm_end(r, me, 'win') else public.gm_end(r, null, 'draw') end;
  end if;
  rest := regexp_replace(nb, '[.Kk]', '', 'g');
  if rest = '' or rest in ('B', 'N', 'b', 'n') then
    r.state := r.state || jsonb_build_object('reason', 'material');
    return public.gm_end(r, null, 'draw');
  end if;
  if (s ->> 'half')::int >= 100 then
    r.state := r.state || jsonb_build_object('reason', 'fifty');
    return public.gm_end(r, null, 'draw');
  end if;
  if reps >= 3 then
    r.state := r.state || jsonb_build_object('reason', 'repetition');
    return public.gm_end(r, null, 'draw');
  end if;
  return r;
end;
$$;

-- Reaction Battle: the server picks when "GO" happens; taps before it are false
-- starts. The app measures the reaction locally, the server caps it at the time
-- that really passed on the server (so nobody can report a faster time).
create or replace function public.gp_reaction(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql set search_path = ''
as $$
declare
  s jsonb := r.state;
  a text := r.created_by::text;
  b text := r.guest_id::text;
  elapsed numeric;
  ms int;
  ta int;
  tb int;
  win uuid;
begin
  if m ? 'ready' then
    if s ->> 'phase' <> 'ready' then raise exception 'Die Runde läuft schon'; end if;
    s := jsonb_set(s, array['ready', me::text], 'true'::jsonb);
    if s -> 'ready' ? a and s -> 'ready' ? b then
      s := s || jsonb_build_object('phase', 'play', 'go_at', now() + make_interval(secs => 2.5 + random() * 3), 'taps', '{}'::jsonb);
    end if;
    r.state := s;
    return r;
  end if;
  if s ->> 'phase' <> 'play' then raise exception 'Wartet noch, bis ihr beide bereit seid'; end if;

  if public.gm_int(m, 'round') is distinct from (s ->> 'round')::int then raise exception 'Diese Runde ist schon vorbei'; end if;
  elapsed := extract(epoch from (now() - (s ->> 'go_at')::timestamptz)) * 1000;
  if m ? 'tap' then
    if s -> 'taps' ? me::text then raise exception 'Du hast schon getippt'; end if;
    if elapsed < 0 then
      ms := -1; -- false start
    else
      ms := public.gm_int(m, 'ms');
      if ms is null or ms > elapsed + 150 then ms := round(elapsed)::int; end if;
      if ms < 90 then ms := -1; end if; -- faster than humanly possible = guessed
    end if;
    s := jsonb_set(s, array['taps', me::text], to_jsonb(ms));
    if ms = -1 and not (s -> 'taps' ? public.gm_other(r, me)::text) then
      s := jsonb_set(s, array['taps', public.gm_other(r, me)::text], '0'::jsonb); -- the other wins this round
    end if;
  elsif m ? 'timeout' then
    if elapsed < 5000 then raise exception 'Noch nicht vorbei'; end if;
    if not (s -> 'taps' ? a) then s := jsonb_set(s, array['taps', a], '-2'::jsonb); end if;
    if not (s -> 'taps' ? b) then s := jsonb_set(s, array['taps', b], '-2'::jsonb); end if;
  else
    raise exception 'Ungültiger Zug';
  end if;

  if s -> 'taps' ? a and s -> 'taps' ? b then
    ta := (s -> 'taps' ->> a)::int;
    tb := (s -> 'taps' ->> b)::int;
    win := case
      when ta >= 0 and (tb < 0 or ta < tb) then r.created_by
      when tb >= 0 and (ta < 0 or tb < ta) then r.guest_id
    end;
    s := s || jsonb_build_object(
      'log', coalesce(s -> 'log', '[]'::jsonb) || jsonb_build_object('taps', s -> 'taps', 'winner', win),
      'round', (s ->> 'round')::int + 1,
      'taps', '{}'::jsonb,
      'go_at', now() + make_interval(secs => 3 + random() * 2.5)
    );
    if win is not null then s := public.gm_add_score(s, win); end if;
    r.state := s;
    if coalesce((s -> 'scores' ->> a)::int, 0) >= 3 or coalesce((s -> 'scores' ->> b)::int, 0) >= 3 or (s ->> 'round')::int > 9 then
      return public.gm_end_by_score(r);
    end if;
    return r;
  end if;
  r.state := s;
  return r;
end;
$$;

-- Couple Quiz: everyone answers about themselves and guesses the other's answer.
create or replace function public.gp_quiz(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  s jsonb := r.state;
  q jsonb := s -> 'questions' -> ((s ->> 'round')::int);
  self_ int := public.gm_int(m, 'self');
  guess_ int := public.gm_int(m, 'guess');
  n int := jsonb_array_length(q -> 'options');
  both_ jsonb;
  a text := r.created_by::text;
  b text := r.guest_id::text;
begin
  if self_ is null or guess_ is null or self_ not between 0 and n - 1 or guess_ not between 0 and n - 1 then
    raise exception 'Bitte wähle zwei Antworten';
  end if;
  both_ := public.gm_submit(r, me, jsonb_build_object('self', self_, 'guess', guess_));
  if both_ is null then
    r.state := s || jsonb_build_object('submitted', coalesce(s -> 'submitted', '[]'::jsonb) || to_jsonb(me));
    return r;
  end if;
  s := s || jsonb_build_object('submitted', '[]'::jsonb, 'rounds', coalesce(s -> 'rounds', '[]'::jsonb) || both_,
                               'round', (s ->> 'round')::int + 1);
  if both_ -> a -> 'guess' = both_ -> b -> 'self' then s := public.gm_add_score(s, r.created_by); end if;
  if both_ -> b -> 'guess' = both_ -> a -> 'self' then s := public.gm_add_score(s, r.guest_id); end if;
  r.state := s;
  if (s ->> 'round')::int >= jsonb_array_length(s -> 'questions') then
    return public.gm_end_by_score(r);
  end if;
  return r;
end;
$$;
revoke execute on function public.gp_quiz(public.game_rooms, uuid, jsonb) from public, anon, authenticated;

create or replace function public.gp_thisorthat(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  s jsonb := r.state;
  pick int := public.gm_int(m, 'pick');
  both_ jsonb;
begin
  if pick is null or pick not in (0, 1) then raise exception 'Bitte wähle eins von beiden'; end if;
  both_ := public.gm_submit(r, me, to_jsonb(pick));
  if both_ is null then
    r.state := s || jsonb_build_object('submitted', coalesce(s -> 'submitted', '[]'::jsonb) || to_jsonb(me));
    return r;
  end if;
  s := s || jsonb_build_object('submitted', '[]'::jsonb, 'rounds', coalesce(s -> 'rounds', '[]'::jsonb) || both_,
                               'round', (s ->> 'round')::int + 1,
                               'matches', (s ->> 'matches')::int + case when both_ -> r.created_by::text = both_ -> r.guest_id::text then 1 else 0 end);
  r.state := s;
  if (s ->> 'round')::int >= jsonb_array_length(s -> 'pairs') then
    return public.gm_end(r, null, 'coop');
  end if;
  return r;
end;
$$;
revoke execute on function public.gp_thisorthat(public.game_rooms, uuid, jsonb) from public, anon, authenticated;

-- Guess My Answer: one writes an answer secretly, the other guesses, the one who
-- answered judges whether the guess counts.
create or replace function public.gp_guess(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  s jsonb := r.state;
  txt text := btrim(m ->> 'text');
  answerer uuid := (s ->> 'answerer')::uuid;
  guesser uuid := public.gm_other(r, answerer);
  both_ jsonb;
  ok boolean;
begin
  if s ->> 'phase' = 'write' then
    if txt is null or char_length(txt) not between 1 and 200 then raise exception 'Bitte schreib 1 bis 200 Zeichen'; end if;
    both_ := public.gm_submit(r, me, to_jsonb(txt));
    if both_ is null then
      r.state := s || jsonb_build_object('submitted', coalesce(s -> 'submitted', '[]'::jsonb) || to_jsonb(me));
      return r;
    end if;
    r.state := s || jsonb_build_object('submitted', '[]'::jsonb, 'phase', 'judge',
      'reveal', jsonb_build_object('answer', both_ -> answerer::text, 'guess', both_ -> guesser::text));
    r.turn := answerer;
    return r;
  end if;
  -- judge
  if me <> answerer then raise exception 'Nur wer geantwortet hat, entscheidet'; end if;
  if jsonb_typeof(m -> 'match') <> 'boolean' then raise exception 'Ungültiger Zug'; end if;
  ok := (m ->> 'match')::boolean;
  if ok then s := public.gm_add_score(s, guesser); end if;
  s := (s - 'reveal') || jsonb_build_object(
    'rounds', coalesce(s -> 'rounds', '[]'::jsonb) || ((s -> 'reveal') || jsonb_build_object('answerer', answerer, 'match', ok)),
    'round', (s ->> 'round')::int + 1,
    'phase', 'write',
    'answerer', guesser
  );
  r.state := s;
  r.turn := null;
  if (s ->> 'round')::int >= jsonb_array_length(s -> 'prompts') then
    return public.gm_end_by_score(r);
  end if;
  return r;
end;
$$;
revoke execute on function public.gp_guess(public.game_rooms, uuid, jsonb) from public, anon, authenticated;

create or replace function public.gp_truthordare(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  s jsonb := r.state;
  pick text := m ->> 'pick';
  card jsonb;
  used int[];
  active uuid := r.turn;
  done_ boolean;
begin
  if s ->> 'phase' = 'choose' then
    if me <> active then raise exception 'Du bist nicht dran'; end if;
    if pick not in ('truth', 'dare') then raise exception 'Wahrheit oder Pflicht?'; end if;
    select coalesce(array_agg(x::int), '{}') into used from jsonb_array_elements_text(coalesce(s -> 'used', '[]'::jsonb)) x;
    card := public.gm_draw(pick, 1, used) -> 0;
    if card is null then
      card := public.gm_draw(pick, 1) -> 0; -- every card was used once: start over
    end if;
    r.state := s || jsonb_build_object('phase', 'do', 'card', jsonb_build_object('kind', pick, 'text', card ->> 'text'),
                                       'used', coalesce(s -> 'used', '[]'::jsonb) || to_jsonb((card ->> 'id')::int));
    return r;
  end if;
  -- phase 'do': the active player can skip, the other one confirms it was done
  if m ? 'skip' and me = active then
    done_ := false;
  elsif m ? 'done' and me <> active then
    done_ := true;
  else
    raise exception 'Ungültiger Zug';
  end if;
  if done_ then s := public.gm_add_score(s, active); end if;
  s := (s - 'card') || jsonb_build_object(
    'phase', 'choose',
    'count', (s ->> 'count')::int + 1,
    'log', coalesce(s -> 'log', '[]'::jsonb) || ((s -> 'card') || jsonb_build_object('player', active, 'done', done_))
  );
  r.state := s;
  r.turn := public.gm_other(r, active);
  if (s ->> 'count')::int >= (s ->> 'total')::int then
    return public.gm_end_by_score(r);
  end if;
  return r;
end;
$$;
revoke execute on function public.gp_truthordare(public.game_rooms, uuid, jsonb) from public, anon, authenticated;

create or replace function public.gp_datechallenge(r public.game_rooms, me uuid, m jsonb)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  s jsonb := r.state;
  card jsonb;
begin
  if m ? 'reroll' then
    if s ->> 'phase' <> 'pick' then raise exception 'Ihr habt die Challenge schon angenommen'; end if;
    if (s ->> 'rerolls')::int <= 0 then raise exception 'Keine neuen Vorschläge mehr übrig'; end if;
    card := public.gm_draw('date', 1, array[(s -> 'challenge' ->> 'id')::int]) -> 0;
    r.state := s || jsonb_build_object('challenge', card, 'rerolls', (s ->> 'rerolls')::int - 1, 'accepted', '[]'::jsonb);
    return r;
  elsif m ? 'accept' then
    if s ->> 'phase' <> 'pick' then raise exception 'Schon angenommen'; end if;
    if s -> 'accepted' @> to_jsonb(me) then raise exception 'Du hast schon zugesagt'; end if;
    s := jsonb_set(s, '{accepted}', (s -> 'accepted') || to_jsonb(me));
    if jsonb_array_length(s -> 'accepted') = 2 then
      s := s || jsonb_build_object('phase', 'on', 'accepted_at', now());
    end if;
    r.state := s;
    return r;
  elsif m ? 'done' then
    if s ->> 'phase' <> 'on' then raise exception 'Nehmt die Challenge erst beide an'; end if;
    if s -> 'done' @> to_jsonb(me) then raise exception 'Du hast es schon abgehakt'; end if;
    s := jsonb_set(s, '{done}', (s -> 'done') || to_jsonb(me));
    r.state := s;
    if jsonb_array_length(s -> 'done') = 2 then
      return public.gm_end(r, null, 'coop');
    end if;
    return r;
  end if;
  raise exception 'Ungültiger Zug';
end;
$$;
revoke execute on function public.gp_datechallenge(public.game_rooms, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Starting a game
-- ---------------------------------------------------------------------------
create or replace function public.gm_init(r public.game_rooms)
returns public.game_rooms
language plpgsql security definer set search_path = ''
as $$
declare
  first_ uuid;
  prev jsonb;
  deck jsonb;
  scores jsonb := jsonb_build_object(r.created_by::text, 0, r.guest_id::text, 0);
begin
  -- Who starts: random, and in a rematch the other one.
  select g.state into prev from public.game_rooms g where g.id = r.rematch_of;
  if prev ? 'first' then
    first_ := case when (prev ->> 'first')::uuid = r.created_by then r.guest_id else r.created_by end;
  else
    first_ := case when random() < 0.5 then r.created_by else r.guest_id end;
  end if;
  r.state := jsonb_build_object('first', first_, 'scores', scores);
  r.turn := null;

  case r.game
    when 'tictactoe' then
      r.state := r.state || jsonb_build_object('board', '.........', 'x', first_);
      r.turn := first_;
    when 'connect4' then
      r.state := r.state || jsonb_build_object('board', repeat('.', 42), 'red', first_);
      r.turn := first_;
    when 'memory' then
      select jsonb_agg(v order by random()) into deck
      from (select s.sym as v from (select sym from generate_series(0, 15) sym order by random() limit 8) s, generate_series(1, 2)) x;
      insert into public.game_secrets (room_id, data) values (r.id, jsonb_build_object('deck', deck))
      on conflict (room_id) do update set data = excluded.data;
      r.state := r.state || jsonb_build_object(
        'cards', (select jsonb_agg(null::int) from generate_series(1, 16)),
        'owner', (select jsonb_agg(null::uuid) from generate_series(1, 16)),
        'open', '[]'::jsonb);
      r.turn := first_;
    when 'chess' then
      r.state := r.state || jsonb_build_object(
        'board', 'rnbqkbnrpppppppp' || repeat('.', 32) || 'PPPPPPPPRNBQKBNR',
        'white', first_, 'color', 'w', 'castling', 'KQkq', 'ep', -1, 'half', 0, 'moves', '[]'::jsonb, 'reps', '{}'::jsonb);
      r.turn := first_;
    when 'reaction' then
      r.state := r.state || jsonb_build_object('phase', 'ready', 'ready', '{}'::jsonb, 'round', 1, 'taps', '{}'::jsonb, 'log', '[]'::jsonb);
    when 'quiz' then
      r.state := r.state || jsonb_build_object('round', 0, 'questions', public.gm_draw('quiz', 6), 'submitted', '[]'::jsonb, 'rounds', '[]'::jsonb);
    when 'thisorthat' then
      r.state := r.state || jsonb_build_object('round', 0, 'pairs', public.gm_draw('thisorthat', 10), 'submitted', '[]'::jsonb, 'rounds', '[]'::jsonb, 'matches', 0);
    when 'guess' then
      r.state := r.state || jsonb_build_object('round', 0, 'prompts', public.gm_draw('guess', 4), 'phase', 'write', 'answerer', first_, 'submitted', '[]'::jsonb, 'rounds', '[]'::jsonb);
    when 'truthordare' then
      r.state := r.state || jsonb_build_object('phase', 'choose', 'count', 0, 'total', 10, 'used', '[]'::jsonb, 'log', '[]'::jsonb);
      r.turn := first_;
    when 'datechallenge' then
      r.state := r.state || jsonb_build_object('phase', 'pick', 'challenge', public.gm_draw('date', 1) -> 0, 'rerolls', 3, 'accepted', '[]'::jsonb, 'done', '[]'::jsonb);
  end case;
  r.status := 'active';
  r.started_at := now();
  return r;
end;
$$;
revoke execute on function public.gm_init(public.game_rooms) from public, anon, authenticated;

create or replace function public.gm_save(r public.game_rooms, me uuid, m jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  old_status text;
  title text;
  p uuid;
begin
  select status into old_status from public.game_rooms where id = r.id;
  update public.game_rooms set
    state = r.state, turn = r.turn, status = r.status, winner = r.winner, result = r.result,
    started_at = r.started_at, finished_at = r.finished_at, version = version + 1, updated_at = now()
  where id = r.id
  returning version into r.version;
  if m is not null then
    insert into public.game_moves (room_id, seq, player, move) values (r.id, r.version, me, m);
  end if;
  if r.status = 'finished' and old_status <> 'finished' then
    title := case r.game
      when 'tictactoe' then 'Tic Tac Toe' when 'connect4' then 'Vier gewinnt' when 'quiz' then 'Couple Quiz'
      when 'thisorthat' then 'This or That' when 'truthordare' then 'Wahrheit oder Pflicht' when 'reaction' then 'Reaction Battle'
      when 'memory' then 'Memory' when 'chess' then 'Schach' when 'guess' then 'Guess My Answer' else 'eine Date-Challenge' end;
    foreach p in array array[r.created_by, r.guest_id] loop
      perform public.log_activity(p, 'game', r.id::text,
        case when r.game = 'datechallenge' then 'hat ' || title || ' geschafft'
             when r.winner = p then 'hat ' || title || ' gewonnen'
             else 'hat ' || title || ' gespielt' end);
    end loop;
  end if;
  return jsonb_build_object('version', r.version, 'status', r.status, 'server_time', now());
end;
$$;
revoke execute on function public.gm_save(public.game_rooms, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public API (what the app calls)
-- ---------------------------------------------------------------------------
create or replace function public.game_create(p_game text, p_rematch_of uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  other uuid := public.partner_id();
  new_id uuid;
begin
  if me is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  if other is null then raise exception 'Ihr seid noch nicht zu zweit verbunden'; end if;
  if (select count(*) from public.game_rooms where created_by = me and status = 'invited' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Du hast schon 5 offene Einladungen';
  end if;
  if p_rematch_of is not null then
    -- Both pressed "Revanche": join the one that already exists.
    select id into new_id from public.game_rooms where rematch_of = p_rematch_of and status in ('invited', 'active') limit 1;
    if new_id is not null then
      if (select created_by from public.game_rooms where id = new_id) <> me and (select status from public.game_rooms where id = new_id) = 'invited' then
        perform public.game_accept(new_id);
      end if;
      return new_id;
    end if;
    if not exists (select 1 from public.game_rooms where id = p_rematch_of and game = p_game and me in (created_by, guest_id) and status = 'finished') then
      raise exception 'Revanche nicht möglich';
    end if;
  end if;
  insert into public.game_rooms (game, created_by, guest_id, rematch_of) values (p_game, me, other, p_rematch_of)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.game_accept(p_room uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.game_rooms;
begin
  select * into r from public.game_rooms where id = p_room for update;
  if not found or r.guest_id <> auth.uid() then raise exception 'Einladung nicht gefunden' using errcode = '42501'; end if;
  if r.status = 'active' then return jsonb_build_object('version', r.version, 'status', r.status, 'server_time', now()); end if;
  if r.status <> 'invited' then raise exception 'Die Einladung gilt nicht mehr'; end if;
  if r.created_at < now() - interval '1 day' then
    update public.game_rooms set status = 'cancelled', updated_at = now() where id = p_room;
    raise exception 'Die Einladung ist abgelaufen';
  end if;
  r := public.gm_init(r);
  return public.gm_save(r, auth.uid(), null);
end;
$$;

-- Decline (guest), cancel (host) or give up (either, while playing).
create or replace function public.game_leave(p_room uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.game_rooms;
  me uuid := auth.uid();
begin
  select * into r from public.game_rooms where id = p_room for update;
  if not found or me not in (r.created_by, r.guest_id) then raise exception 'Spiel nicht gefunden' using errcode = '42501'; end if;
  if r.status = 'invited' then
    r.status := case when me = r.guest_id then 'declined' else 'cancelled' end;
    r.finished_at := now();
  elsif r.status = 'active' then
    if r.game in ('quiz', 'thisorthat', 'truthordare', 'guess', 'datechallenge') then
      r := public.gm_end(r, null, 'abandoned');
    else
      r := public.gm_end(r, public.gm_other(r, me), 'win');
      r.state := r.state || jsonb_build_object('reason', 'resigned', 'resigned', me);
    end if;
  else
    return jsonb_build_object('version', r.version, 'status', r.status, 'server_time', now());
  end if;
  return public.gm_save(r, me, '{"leave": true}'::jsonb);
end;
$$;

create or replace function public.game_move(p_room uuid, p_move jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.game_rooms;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_move is null or jsonb_typeof(p_move) <> 'object' or length(p_move::text) > 1000 then raise exception 'Ungültiger Zug'; end if;
  select * into r from public.game_rooms where id = p_room for update;
  if not found or me not in (r.created_by, r.guest_id) then raise exception 'Spiel nicht gefunden' using errcode = '42501'; end if;
  if r.status <> 'active' then raise exception 'Das Spiel ist schon vorbei'; end if;
  r := case r.game
    when 'tictactoe' then public.gp_tictactoe(r, me, p_move)
    when 'connect4' then public.gp_connect4(r, me, p_move)
    when 'memory' then public.gp_memory(r, me, p_move)
    when 'chess' then public.gp_chess(r, me, p_move)
    when 'reaction' then public.gp_reaction(r, me, p_move)
    when 'quiz' then public.gp_quiz(r, me, p_move)
    when 'thisorthat' then public.gp_thisorthat(r, me, p_move)
    when 'guess' then public.gp_guess(r, me, p_move)
    when 'truthordare' then public.gp_truthordare(r, me, p_move)
    when 'datechallenge' then public.gp_datechallenge(r, me, p_move)
  end;
  -- Hidden answers never go into the (readable) move log.
  return public.gm_save(r, me, case when r.game in ('quiz', 'thisorthat', 'guess') and not (p_move ? 'match') then '{"answered": true}'::jsonb else p_move end);
end;
$$;

create or replace function public.game_clock()
returns timestamptz
language sql stable set search_path = ''
as $$
  select now();
$$;

create or replace function public.game_scoreboard()
returns table (game text, user_id uuid, wins bigint, draws bigint, played bigint)
language sql stable security definer set search_path = ''
as $$
  select g.game, p.id, count(*) filter (where g.winner = p.id), count(*) filter (where g.result in ('draw', 'coop')), count(*)
  from public.game_rooms g
  cross join lateral (values (g.created_by), (g.guest_id)) p (id)
  where g.status = 'finished' and public.is_member()
  group by g.game, p.id;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'game_create(text, uuid)', 'game_accept(uuid)', 'game_leave(uuid)', 'game_move(uuid, jsonb)', 'game_clock()', 'game_scoreboard()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Internal helpers are not part of the API.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'gp\_%' or p.proname like 'gm\_%' or p.proname like 'chess\_%')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Invites ring on the partner's devices (push function, category "game").
drop trigger if exists push_games on public.game_rooms;
create trigger push_games after insert on public.game_rooms
  for each row execute function public.push_on_insert('game');

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_rooms') then
    alter publication supabase_realtime add table public.game_rooms;
  end if;
end $$;
