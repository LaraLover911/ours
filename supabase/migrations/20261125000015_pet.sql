-- ours. — Mochi, your little shared pet.
-- All needs are computed on the server from the last stored values and the time
-- that passed (decay). Values never go below a gentle floor: Mochi cannot die and
-- is never "sick"; after a long absence Mochi is only sleepy and missed you.
-- Coins are a game currency only (no real money anywhere). Daily quest rewards
-- are unique per person and day, so nothing can be claimed twice.
-- "Mochi's Bond" is Mochi's trust in being cared for. It is a game value and says
-- nothing about the two of you.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.pets (
  id             uuid primary key default gen_random_uuid(),
  singleton      boolean not null default true unique check (singleton),
  name           text not null default 'Mochi' check (char_length(btrim(name)) between 1 and 24),
  stage          int not null default 0 check (stage between 0 and 3),
  xp             int not null default 0 check (xp >= 0),
  coins          int not null default 50 check (coins >= 0),
  sleeping       boolean not null default false,
  last_cared_at  timestamptz not null default now(),
  version        int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.pet_stats (
  pet_id       uuid primary key references public.pets (id) on delete cascade,
  hunger       numeric not null default 80 check (hunger between 0 and 100),   -- 100 = full
  energy       numeric not null default 80 check (energy between 0 and 100),
  joy          numeric not null default 80 check (joy between 0 and 100),
  clean        numeric not null default 90 check (clean between 0 and 100),
  measured_at  timestamptz not null default now()
);

create table if not exists public.pet_items (
  id         text primary key,
  kind       text not null check (kind in ('food', 'toy', 'care', 'furniture', 'room')),
  name       text not null,
  emoji      text not null,
  price      int not null check (price >= 0),
  effect     jsonb not null default '{}'::jsonb,
  min_stage  int not null default 0,
  sort       int not null default 0
);

create table if not exists public.pet_inventory (
  pet_id   uuid not null references public.pets (id) on delete cascade,
  item_id  text not null references public.pet_items (id),
  qty      int not null default 0 check (qty >= 0),
  primary key (pet_id, item_id)
);

create table if not exists public.pet_house (
  pet_id     uuid not null references public.pets (id) on delete cascade,
  room       text not null check (room in ('living', 'bedroom', 'garden')),
  unlocked   boolean not null default false,
  wall       text not null default '#f6e3e8' check (wall ~ '^#[0-9a-f]{6}$'),
  floor      text not null default '#e9d5c4' check (floor ~ '^#[0-9a-f]{6}$'),
  primary key (pet_id, room)
);

create table if not exists public.pet_furniture (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references public.pets (id) on delete cascade,
  item_id     text not null references public.pet_items (id),
  room        text not null check (room in ('living', 'bedroom', 'garden')),
  x           numeric not null check (x between -1 and 1),
  z           numeric not null check (z between -1 and 1),
  rot         int not null default 0 check (rot in (0, 90, 180, 270)),
  placed_by   uuid references public.profiles (id) on delete set null,
  placed_at   timestamptz not null default now()
);

create table if not exists public.pet_quests (
  day         date not null,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  quest       text not null,
  progress    int not null default 0,
  goal        int not null,
  reward      int not null,
  claimed_at  timestamptz,
  primary key (day, user_id, quest)
);

create table if not exists public.pet_achievements (
  pet_id       uuid not null references public.pets (id) on delete cascade,
  key          text not null,
  unlocked_at  timestamptz not null default now(),
  unlocked_by  uuid references public.profiles (id) on delete set null,
  primary key (pet_id, key)
);

create table if not exists public.pet_events (
  id          bigint generated always as identity primary key,
  pet_id      uuid not null references public.pets (id) on delete cascade,
  actor       uuid references public.profiles (id) on delete set null,
  kind        text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists pet_events_recent on public.pet_events (pet_id, created_at desc);

create table if not exists public.pet_evolution (
  pet_id      uuid not null references public.pets (id) on delete cascade,
  stage       int not null,
  reached_at  timestamptz not null default now(),
  primary key (pet_id, stage)
);

create table if not exists public.pet_bond (
  pet_id   uuid primary key references public.pets (id) on delete cascade,
  points   int not null default 0 check (points >= 0)
);

-- Everything readable by the two of you, nothing writable directly.
do $$
declare
  t text;
begin
  foreach t in array array['pets', 'pet_stats', 'pet_items', 'pet_inventory', 'pet_house', 'pet_furniture', 'pet_quests', 'pet_achievements', 'pet_events', 'pet_evolution', 'pet_bond'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "pet: members read" on public.%I', t);
    execute format('create policy "pet: members read" on public.%I for select to authenticated using (public.is_member())', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
insert into public.pet_items (id, kind, name, emoji, price, effect, min_stage, sort) values
  ('apple',      'food', 'Apfel',            '🍎', 5,  '{"hunger": 18, "joy": 2}', 0, 1),
  ('onigiri',    'food', 'Reisbällchen',     '🍙', 8,  '{"hunger": 28, "energy": 4}', 0, 2),
  ('mochi',      'food', 'Erdbeer-Mochi',    '🍡', 14, '{"hunger": 24, "joy": 12}', 0, 3),
  ('cake',       'food', 'Törtchen',         '🧁', 22, '{"hunger": 30, "joy": 20}', 1, 4),
  ('milk',       'food', 'Warme Milch',      '🥛', 10, '{"hunger": 12, "energy": 14}', 0, 5),
  ('ball',       'toy',  'Bällchen',         '⚽', 25, '{"joy": 22, "energy": -8}', 0, 10),
  ('feather',    'toy',  'Feder',            '🪶', 30, '{"joy": 26, "energy": -6}', 0, 11),
  ('soap',       'care', 'Seife',            '🧼', 8,  '{"clean": 40}', 0, 20),
  ('bed',        'furniture', 'Wolkenbett',  '🛏️', 60, '{"model": "bed"}', 0, 30),
  ('plant',      'furniture', 'Pflanze',     '🪴', 30, '{"model": "plant"}', 0, 31),
  ('rug',        'furniture', 'Runder Teppich', '🟣', 35, '{"model": "rug"}', 0, 32),
  ('lamp',       'furniture', 'Stehlampe',   '💡', 35, '{"model": "lamp"}', 0, 33),
  ('beanbag',    'furniture', 'Sitzsack',    '🫘', 45, '{"model": "beanbag"}', 0, 34),
  ('shelf',      'furniture', 'Bücherregal', '📚', 70, '{"model": "shelf"}', 1, 35),
  ('frame',      'furniture', 'Bilderrahmen','🖼️', 25, '{"model": "frame"}', 0, 36),
  ('stars',      'furniture', 'Sternenlicht','✨', 45, '{"model": "stars"}', 1, 37),
  ('table',      'furniture', 'Tischchen',   '🪵', 40, '{"model": "table"}', 0, 38),
  ('flowers',    'furniture', 'Blumenbeet',  '🌷', 40, '{"model": "flowers"}', 0, 39),
  ('room_bedroom','room', 'Schlafzimmer',    '🌙', 150, '{"room": "bedroom"}', 0, 50),
  ('room_garden', 'room', 'Garten',          '🌳', 300, '{"room": "garden"}', 1, 51)
on conflict (id) do update set kind = excluded.kind, name = excluded.name, emoji = excluded.emoji, price = excluded.price,
  effect = excluded.effect, min_stage = excluded.min_stage, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------
-- Decay per hour and the floor nobody drops below (so Mochi never suffers).
create or replace function public.pet_decayed(s public.pet_stats, sleeping boolean, at timestamptz)
returns public.pet_stats
language plpgsql stable set search_path = ''
as $$
declare
  h numeric := greatest(0, extract(epoch from (at - s.measured_at)) / 3600.0);
begin
  s.hunger := greatest(12, s.hunger - 3.5 * h);
  s.joy := greatest(12, s.joy - 2.5 * h);
  s.clean := greatest(15, s.clean - 1.5 * h);
  s.energy := case when sleeping then least(100, s.energy + 12 * h) else greatest(15, s.energy - 2 * h) end;
  s.measured_at := at;
  return s;
end;
$$;

create or replace function public.pet_the()
returns public.pets
language plpgsql security definer set search_path = ''
as $$
declare
  p public.pets;
begin
  select * into p from public.pets limit 1;
  if p.id is null then
    insert into public.pets default values on conflict (singleton) do nothing returning * into p;
    if p.id is null then
      select * into p from public.pets limit 1; -- created by the other one a moment ago
      return p;
    end if;
    insert into public.pet_stats (pet_id) values (p.id);
    insert into public.pet_bond (pet_id) values (p.id);
    insert into public.pet_house (pet_id, room, unlocked) values (p.id, 'living', true), (p.id, 'bedroom', false), (p.id, 'garden', false);
    insert into public.pet_inventory (pet_id, item_id, qty) values (p.id, 'apple', 3), (p.id, 'soap', 1);
    insert into public.pet_evolution (pet_id, stage) values (p.id, 0);
  end if;
  return p;
end;
$$;

create or replace function public.pet_mood(s public.pet_stats, sleeping boolean, away_hours numeric)
returns text
language sql immutable set search_path = ''
as $$
  select case
    when sleeping then 'sleeping'
    when away_hours >= 36 then 'missed_you'
    when s.energy < 25 then 'sleepy'
    when s.hunger < 30 then 'hungry'
    when s.clean < 30 then 'messy'
    when s.joy < 35 then 'bored'
    when (s.hunger + s.joy + s.energy + s.clean) / 4 > 75 then 'happy'
    else 'calm' end;
$$;

-- Read-only snapshot with needs as of now.
create or replace function public.pet_state()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p public.pets;
  s public.pet_stats;
  b int;
  me uuid := auth.uid();
begin
  if me is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  p := public.pet_the();
  select * into s from public.pet_stats where pet_id = p.id;
  s := public.pet_decayed(s, p.sleeping, now());
  select points into b from public.pet_bond where pet_id = p.id;
  perform public.pet_quests_ensure(me);
  return jsonb_build_object(
    'pet', to_jsonb(p),
    'stats', jsonb_build_object('hunger', round(s.hunger), 'energy', round(s.energy), 'joy', round(s.joy), 'clean', round(s.clean)),
    'mood', public.pet_mood(s, p.sleeping, extract(epoch from (now() - p.last_cared_at)) / 3600.0),
    'bond', jsonb_build_object('points', b, 'level', floor(sqrt(b / 10.0))::int),
    'away_hours', round(extract(epoch from (now() - p.last_cared_at)) / 3600.0),
    'server_time', now()
  );
end;
$$;

-- Daily quests: the same small set for each of you, every Berlin day.
create or replace function public.pet_quests_ensure(uid uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.pet_quests (day, user_id, quest, goal, reward)
  values (public.berlin_today(), uid, 'feed', 2, 20),
         (public.berlin_today(), uid, 'pet', 3, 10),
         (public.berlin_today(), uid, 'play', 1, 15),
         (public.berlin_today(), uid, 'minigame', 1, 15),
         (public.berlin_today(), uid, 'clean', 1, 10)
  on conflict do nothing;
$$;

create or replace function public.pet_quest_step(uid uuid, q text, n int default 1)
returns void
language sql security definer set search_path = ''
as $$
  update public.pet_quests set progress = least(goal, progress + n)
  where day = public.berlin_today() and user_id = uid and quest = q;
$$;

create or replace function public.pet_unlock(pid uuid, k text, uid uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.pet_achievements (pet_id, key, unlocked_by) values (pid, k, uid) on conflict do nothing;
$$;

-- Care actions: feed, play, pet, clean, sleep, wake.
create or replace function public.pet_act(p_action text, p_item text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.pets;
  s public.pet_stats;
  it public.pet_items;
  eff jsonb := '{}'::jsonb;
  coins int := 0;
  xp int := 0;
  bond int := 0;
  recent int;
  away numeric;
  next_stage int;
begin
  if me is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  p := public.pet_the();
  select * into p from public.pets where id = p.id for update;
  select * into s from public.pet_stats where pet_id = p.id for update;
  s := public.pet_decayed(s, p.sleeping, now());
  away := extract(epoch from (now() - p.last_cared_at)) / 3600.0;
  perform public.pet_quests_ensure(me);

  -- A little rate limit so the buttons can't be farmed.
  select count(*) into recent from public.pet_events where pet_id = p.id and actor = me and created_at > now() - interval '1 minute';
  if recent >= 20 then raise exception 'Mochi braucht kurz eine Pause'; end if;

  if p.sleeping and p_action not in ('wake', 'pet') then raise exception 'Mochi schläft gerade. Weck Mochi erst sanft.'; end if;

  case p_action
    when 'feed', 'play', 'clean' then
      select * into it from public.pet_items where id = p_item;
      if it.id is null or it.kind <> (case p_action when 'feed' then 'food' when 'play' then 'toy' else 'care' end) then
        raise exception 'Das passt hier nicht';
      end if;
      if p_action = 'feed' and s.hunger >= 97 then raise exception 'Mochi ist pappsatt'; end if;
      if p_action = 'play' and s.energy < 18 then raise exception 'Mochi ist zu müde zum Spielen'; end if;
      if p_action <> 'play' then
        update public.pet_inventory set qty = qty - 1 where pet_id = p.id and item_id = it.id and qty > 0;
        if not found then raise exception 'Davon ist nichts mehr da. Schau im Shop vorbei.'; end if;
      elsif not exists (select 1 from public.pet_inventory where pet_id = p.id and item_id = it.id and qty > 0) then
        raise exception 'Dieses Spielzeug habt ihr noch nicht';
      end if;
      eff := it.effect;
      coins := 2; xp := case p_action when 'feed' then 6 when 'play' then 8 else 5 end; bond := 2;
      perform public.pet_quest_step(me, p_action);
      if p_action = 'feed' then perform public.pet_unlock(p.id, 'first_feed', me); end if;
    when 'pet' then
      select count(*) into recent from public.pet_events where pet_id = p.id and actor = me and kind = 'pet' and created_at > now() - interval '20 seconds';
      if recent > 0 then
        eff := '{}'::jsonb; -- still cute, but no extra points
      else
        eff := '{"joy": 6}'::jsonb; xp := 2; bond := 1; coins := 1;
        perform public.pet_quest_step(me, 'pet');
      end if;
    when 'sleep' then
      if s.energy > 85 then raise exception 'Mochi ist gar nicht müde'; end if;
      p.sleeping := true;
    when 'wake' then
      p.sleeping := false;
    else
      raise exception 'Unbekannte Aktion';
  end case;

  -- Coming back after a long time: a happy reunion, never a punishment.
  if away >= 36 and p_action <> 'sleep' then
    eff := eff || jsonb_build_object('joy', coalesce((eff ->> 'joy')::numeric, 0) + 25);
    perform public.pet_unlock(p.id, 'reunion', me);
  end if;

  s.hunger := least(100, greatest(0, s.hunger + coalesce((eff ->> 'hunger')::numeric, 0)));
  s.energy := least(100, greatest(0, s.energy + coalesce((eff ->> 'energy')::numeric, 0)));
  s.joy := least(100, greatest(0, s.joy + coalesce((eff ->> 'joy')::numeric, 0)));
  s.clean := least(100, greatest(0, s.clean + coalesce((eff ->> 'clean')::numeric, 0)));
  update public.pet_stats set hunger = s.hunger, energy = s.energy, joy = s.joy, clean = s.clean, measured_at = s.measured_at where pet_id = p.id;

  p.xp := p.xp + xp;
  p.coins := p.coins + coins;
  next_stage := case when p.xp >= 1500 then 3 when p.xp >= 600 then 2 when p.xp >= 200 then 1 else 0 end;
  if next_stage > p.stage then
    p.stage := next_stage;
    insert into public.pet_evolution (pet_id, stage) values (p.id, next_stage) on conflict do nothing;
    perform public.pet_unlock(p.id, 'stage_' || next_stage, me);
    insert into public.pet_events (pet_id, actor, kind, data) values (p.id, me, 'evolve', jsonb_build_object('stage', next_stage));
    perform public.log_activity(me, 'pet', p.id::text || ':' || next_stage, p.name || ' ist gewachsen: Stufe ' || next_stage);
  end if;
  update public.pets set xp = p.xp, coins = p.coins, stage = p.stage, sleeping = p.sleeping,
    last_cared_at = case when p_action in ('sleep', 'wake') then last_cared_at else now() end,
    version = version + 1, updated_at = now()
  where id = p.id;
  if bond > 0 then update public.pet_bond set points = points + bond where pet_id = p.id; end if;
  if (select points from public.pet_bond where pet_id = p.id) >= 250 then perform public.pet_unlock(p.id, 'bond_5', me); end if;
  insert into public.pet_events (pet_id, actor, kind, data) values (p.id, me, p_action, jsonb_build_object('item', p_item));
  return public.pet_state();
end;
$$;

create or replace function public.pet_buy(p_item text, p_qty int default 1)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.pets;
  it public.pet_items;
  cost int;
begin
  if me is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  if p_qty is null or p_qty not between 1 and 10 then raise exception 'Ungültige Menge'; end if;
  p := public.pet_the();
  select * into p from public.pets where id = p.id for update;
  select * into it from public.pet_items where id = p_item;
  if it.id is null then raise exception 'Gibt es nicht'; end if;
  if it.min_stage > p.stage then raise exception 'Das gibt es erst, wenn % größer ist', p.name; end if;
  if it.kind = 'room' then
    p_qty := 1;
    if exists (select 1 from public.pet_house where pet_id = p.id and room = it.effect ->> 'room' and unlocked) then raise exception 'Schon freigeschaltet'; end if;
  end if;
  cost := it.price * p_qty;
  if p.coins < cost then raise exception 'Nicht genug Münzen (% fehlen)', cost - p.coins; end if;
  update public.pets set coins = coins - cost, version = version + 1, updated_at = now() where id = p.id;
  if it.kind = 'room' then
    update public.pet_house set unlocked = true where pet_id = p.id and room = it.effect ->> 'room';
  else
    insert into public.pet_inventory (pet_id, item_id, qty) values (p.id, it.id, p_qty)
    on conflict (pet_id, item_id) do update set qty = public.pet_inventory.qty + excluded.qty;
  end if;
  perform public.pet_unlock(p.id, 'first_buy', me);
  insert into public.pet_events (pet_id, actor, kind, data) values (p.id, me, 'buy', jsonb_build_object('item', it.id, 'qty', p_qty));
  return public.pet_state();
end;
$$;

-- Place furniture from the inventory, move it, or put it back.
create or replace function public.pet_furnish(p_action text, p_item text default null, p_id uuid default null, p_room text default null, p_x numeric default 0, p_z numeric default 0, p_rot int default 0)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.pets;
  f public.pet_furniture;
  new_id uuid;
begin
  if me is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  p := public.pet_the();
  if p_x not between -1 and 1 or p_z not between -1 and 1 or p_rot not in (0, 90, 180, 270) then raise exception 'Ungültige Position'; end if;
  if p_action = 'place' then
    if not exists (select 1 from public.pet_items where id = p_item and kind = 'furniture') then raise exception 'Das ist kein Möbelstück'; end if;
    if not exists (select 1 from public.pet_house where pet_id = p.id and room = p_room and unlocked) then raise exception 'Dieser Raum ist noch nicht freigeschaltet'; end if;
    if (select count(*) from public.pet_furniture where pet_id = p.id and room = p_room) >= 16 then raise exception 'Der Raum ist voll'; end if;
    update public.pet_inventory set qty = qty - 1 where pet_id = p.id and item_id = p_item and qty > 0;
    if not found then raise exception 'Kauf das zuerst im Shop'; end if;
    insert into public.pet_furniture (pet_id, item_id, room, x, z, rot, placed_by) values (p.id, p_item, p_room, p_x, p_z, p_rot, me) returning id into new_id;
    if (select count(*) from public.pet_furniture where pet_id = p.id) >= 5 then perform public.pet_unlock(p.id, 'furniture_5', me); end if;
  elsif p_action = 'move' then
    update public.pet_furniture set x = p_x, z = p_z, rot = p_rot where id = p_id and pet_id = p.id returning * into f;
    if f.id is null then raise exception 'Nicht gefunden'; end if;
  elsif p_action = 'store' then
    delete from public.pet_furniture where id = p_id and pet_id = p.id returning * into f;
    if f.id is null then raise exception 'Nicht gefunden'; end if;
    insert into public.pet_inventory (pet_id, item_id, qty) values (p.id, f.item_id, 1)
    on conflict (pet_id, item_id) do update set qty = public.pet_inventory.qty + 1;
  else
    raise exception 'Unbekannte Aktion';
  end if;
  update public.pets set version = version + 1, updated_at = now() where id = p.id;
  insert into public.pet_events (pet_id, actor, kind, data) values (p.id, me, 'furnish', jsonb_build_object('action', p_action, 'item', coalesce(p_item, f.item_id)));
  return jsonb_build_object('id', coalesce(new_id, f.id));
end;
$$;

create or replace function public.pet_claim(p_quest text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  q public.pet_quests;
  p public.pets;
begin
  if me is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  p := public.pet_the();
  update public.pet_quests set claimed_at = now()
  where day = public.berlin_today() and user_id = me and quest = p_quest and progress >= goal and claimed_at is null
  returning * into q;
  if q.quest is null then raise exception 'Diese Aufgabe ist noch nicht fertig oder schon eingelöst'; end if;
  update public.pets set coins = coins + q.reward, xp = xp + 10, version = version + 1, updated_at = now() where id = p.id;
  if (select count(*) from public.pet_quests where user_id = me and claimed_at is not null) >= 10 then perform public.pet_unlock(p.id, 'quests_10', me); end if;
  insert into public.pet_events (pet_id, actor, kind, data) values (p.id, me, 'quest', jsonb_build_object('quest', p_quest, 'reward', q.reward));
  return public.pet_state();
end;
$$;

-- Mini game ("Snack-Fangen"): played in the browser. The server caps what it can
-- be worth: at most 3 paid rounds per person and day, at most 20 coins a round.
create or replace function public.pet_minigame(p_score int)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.pets;
  rounds int;
  reward int := 0;
begin
  if me is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  if p_score is null or p_score not between 0 and 200 then raise exception 'Ungültige Punktzahl'; end if;
  p := public.pet_the();
  perform public.pet_quests_ensure(me);
  select count(*) into rounds from public.pet_events
  where pet_id = p.id and actor = me and kind = 'minigame' and created_at >= (public.berlin_today()::timestamp at time zone 'Europe/Berlin');
  if rounds < 3 then reward := least(20, p_score / 3); end if;
  update public.pets set coins = coins + reward, xp = xp + least(10, p_score / 5), version = version + 1, updated_at = now() where id = p.id;
  update public.pet_stats set joy = least(100, joy + 8) where pet_id = p.id;
  perform public.pet_quest_step(me, 'minigame');
  if p_score >= 50 then perform public.pet_unlock(p.id, 'minigame_50', me); end if;
  insert into public.pet_events (pet_id, actor, kind, data) values (p.id, me, 'minigame', jsonb_build_object('score', p_score, 'reward', reward));
  return public.pet_state() || jsonb_build_object('reward', reward, 'paid_rounds_left', greatest(0, 2 - rounds));
end;
$$;

create or replace function public.pet_rename(p_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  p public.pets;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  if char_length(btrim(p_name)) not between 1 and 24 then raise exception 'Der Name braucht 1 bis 24 Zeichen'; end if;
  p := public.pet_the();
  update public.pets set name = btrim(p_name), version = version + 1, updated_at = now() where id = p.id;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'pet_state()', 'pet_act(text, text)', 'pet_buy(text, int)', 'pet_furnish(text, text, uuid, text, numeric, numeric, int)',
    'pet_claim(text)', 'pet_minigame(int)', 'pet_rename(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array[
    'pet_the()', 'pet_decayed(public.pet_stats, boolean, timestamptz)', 'pet_mood(public.pet_stats, boolean, numeric)',
    'pet_quests_ensure(uuid)', 'pet_quest_step(uuid, text, int)', 'pet_unlock(uuid, text, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['pets', 'pet_furniture', 'pet_events', 'pet_inventory', 'pet_house'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
