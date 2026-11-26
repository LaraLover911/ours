-- ours. — couple features: shared calendar, countdowns & anniversary reminders,
-- time capsules, world map, moodboard, wishlist (with secret claims), goals,
-- shared notes, voice notes, photo of the day, daily challenge, watchlist.
-- Everything is readable only by the two of you (RLS) and nothing is pre-filled
-- with made-up memories, dates or photos.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.member_crud(t text, owner_col text default 'created_by')
returns void
language plpgsql set search_path = ''
as $$
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists "couple: members read" on public.%I', t);
  execute format('create policy "couple: members read" on public.%I for select to authenticated using (public.is_member())', t);
  execute format('drop policy if exists "couple: members add as themselves" on public.%I', t);
  execute format('create policy "couple: members add as themselves" on public.%I for insert to authenticated with check (public.is_member() and %I = auth.uid())', t, owner_col);
  execute format('drop policy if exists "couple: members edit" on public.%I', t);
  execute format('create policy "couple: members edit" on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
  execute format('drop policy if exists "couple: members delete" on public.%I', t);
  execute format('create policy "couple: members delete" on public.%I for delete to authenticated using (public.is_member())', t);
  execute format('revoke all on public.%I from anon', t);
end;
$$;
revoke execute on function public.member_crud(text, text) from public, anon, authenticated;

-- Upload areas for the new features.
alter table public.uploads drop constraint if exists uploads_area_check;
alter table public.uploads add constraint uploads_area_check
  check (area in ('chat', 'memories', 'diary', 'letters', 'surprises', 'avatars', 'backgrounds', 'private', 'clips', 'studio', 'voice', 'capsule', 'photo', 'moodboard'));

-- ---------------------------------------------------------------------------
-- Shared calendar & countdowns
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  starts_at   timestamptz not null,
  ends_at     timestamptz check (ends_at is null or ends_at >= starts_at),
  all_day     boolean not null default false,
  location    text check (char_length(location) <= 140),
  note        text check (char_length(note) <= 2000),
  color       text not null default 'rose' check (color in ('rose', 'lavender', 'sage', 'ocean', 'peach')),
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists calendar_events_start on public.calendar_events (starts_at);
select public.member_crud('calendar_events');
drop trigger if exists calendar_events_updated_at on public.calendar_events;
create trigger calendar_events_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();

create table if not exists public.countdowns (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 100),
  target_at   timestamptz not null,
  emoji       text not null default '⏳' check (char_length(emoji) <= 8),
  notify      boolean not null default true,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
select public.member_crud('countdowns');

-- One row per reminder that was due (also the push trigger source). Filled by the daily job.
create table if not exists public.couple_reminders (
  id         bigint generated always as identity primary key,
  day        date not null,
  kind       text not null check (kind in ('anniversary', 'monthiversary', 'countdown', 'capsule')),
  ref        text not null,
  title      text not null check (char_length(title) <= 160),
  created_at timestamptz not null default now(),
  unique (day, kind, ref)
);
alter table public.couple_reminders enable row level security;
drop policy if exists "couple: members read" on public.couple_reminders;
create policy "couple: members read" on public.couple_reminders for select to authenticated using (public.is_member());
revoke insert, update, delete on public.couple_reminders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Time capsules: the content stays sealed until open_at, for both of you.
-- ---------------------------------------------------------------------------
create table if not exists public.time_capsules (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 120),
  open_at     timestamptz not null,
  opened_at   timestamptz,
  created_at  timestamptz not null default now(),
  check (open_at >= created_at + interval '1 hour')
);
alter table public.time_capsules enable row level security;
drop policy if exists "capsule: members see that it exists" on public.time_capsules;
create policy "capsule: members see that it exists" on public.time_capsules for select to authenticated using (public.is_member());
drop policy if exists "capsule: author removes before it opens" on public.time_capsules;
create policy "capsule: author removes before it opens" on public.time_capsules for delete to authenticated using (author_id = auth.uid() and open_at > now());
revoke insert, update on public.time_capsules from anon, authenticated;

create table if not exists public.time_capsule_contents (
  capsule_id   uuid primary key references public.time_capsules (id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 20000),
  media_paths  text[] not null default '{}' check (cardinality(media_paths) <= 10)
);
alter table public.time_capsule_contents enable row level security;
drop policy if exists "capsule: readable once open" on public.time_capsule_contents;
create policy "capsule: readable once open" on public.time_capsule_contents for select to authenticated
  using (public.is_member() and exists (select 1 from public.time_capsules c where c.id = capsule_id and c.open_at <= now()));
revoke insert, update, delete on public.time_capsule_contents from anon, authenticated;

create or replace function public.capsule_create(p_title text, p_open_at timestamptz, p_body text, p_media text[] default '{}')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  if p_open_at < now() + interval '1 hour' then raise exception 'Eine Zeitkapsel öffnet frühestens in einer Stunde'; end if;
  if p_open_at > now() + interval '50 years' then raise exception 'Höchstens 50 Jahre in die Zukunft'; end if;
  if exists (select 1 from unnest(coalesce(p_media, '{}')) m where m not like me::text || '/capsule/%') then
    raise exception 'Nur eigene Uploads';
  end if;
  insert into public.time_capsules (author_id, title, open_at) values (me, p_title, p_open_at) returning id into new_id;
  insert into public.time_capsule_contents (capsule_id, body, media_paths) values (new_id, p_body, coalesce(p_media, '{}'));
  return new_id;
end;
$$;

create or replace function public.capsule_mark_opened(p_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.time_capsules set opened_at = coalesce(opened_at, now())
  where id = p_id and open_at <= now() and public.is_member();
$$;

-- ---------------------------------------------------------------------------
-- World map, moodboard, goals, watchlist
-- ---------------------------------------------------------------------------
create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  country     text check (char_length(country) <= 80),
  lat         numeric not null check (lat between -90 and 90),
  lon         numeric not null check (lon between -180 and 180),
  kind        text not null default 'visited' check (kind in ('visited', 'dream')),
  visited_on  date,
  note        text check (char_length(note) <= 1000),
  memory_id   uuid references public.memories (id) on delete set null,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
select public.member_crud('places');

create table if not exists public.moodboard_items (
  id          uuid primary key default gen_random_uuid(),
  board       text not null default 'us' check (char_length(btrim(board)) between 1 and 40),
  kind        text not null check (kind in ('photo', 'web', 'color', 'quote')),
  path        text check (char_length(path) <= 400),
  url         text check (url is null or (url ~ '^https://' and char_length(url) <= 600)),
  color       text check (color is null or color ~ '^#[0-9a-f]{6}$'),
  body        text check (char_length(body) <= 280),
  credit      jsonb check (credit is null or pg_column_size(credit) < 1000),
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (
    (kind = 'photo' and path is not null) or (kind = 'web' and url is not null) or
    (kind = 'color' and color is not null) or (kind = 'quote' and char_length(btrim(coalesce(body, ''))) > 0)
  )
);
select public.member_crud('moodboard_items');

create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  description  text check (char_length(description) <= 1000),
  emoji        text not null default '🎯' check (char_length(emoji) <= 8),
  target_date  date,
  done_at      timestamptz,
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);
select public.member_crud('goals');

create table if not exists public.goal_steps (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.goals (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  sort        int not null default 0,
  done_at     timestamptz,
  done_by     uuid references public.profiles (id) on delete set null,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
select public.member_crud('goal_steps');

create table if not exists public.watch_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  kind        text not null default 'movie' check (kind in ('movie', 'tv', 'other')),
  tmdb_id     text check (tmdb_id ~ '^(movie|tv):[0-9]{1,10}$'),
  poster_url  text check (poster_url is null or poster_url ~ '^https://image\.tmdb\.org/'),
  year        text check (year ~ '^[0-9]{4}$'),
  overview    text check (char_length(overview) <= 600),
  status      text not null default 'want' check (status in ('want', 'watching', 'watched')),
  watched_at  timestamptz,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
select public.member_crud('watch_items');
create unique index if not exists watch_items_tmdb on public.watch_items (tmdb_id) where tmdb_id is not null;

create table if not exists public.watch_ratings (
  item_id   uuid not null references public.watch_items (id) on delete cascade,
  user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  stars     smallint not null check (stars between 1 and 5),
  primary key (item_id, user_id)
);
alter table public.watch_ratings enable row level security;
drop policy if exists "ratings: members read" on public.watch_ratings;
create policy "ratings: members read" on public.watch_ratings for select to authenticated using (public.is_member());
drop policy if exists "ratings: own" on public.watch_ratings;
create policy "ratings: own" on public.watch_ratings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

-- ---------------------------------------------------------------------------
-- Wishlist: the owner never sees who reserved what.
-- ---------------------------------------------------------------------------
create table if not exists public.wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  link        text check (link is null or (link ~ '^https?://' and char_length(link) <= 600)),
  price       text check (char_length(price) <= 40),
  note        text check (char_length(note) <= 500),
  priority    smallint not null default 2 check (priority between 1 and 3),
  received_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.wishlist_items enable row level security;
drop policy if exists "wish: members read" on public.wishlist_items;
create policy "wish: members read" on public.wishlist_items for select to authenticated using (public.is_member());
drop policy if exists "wish: owner adds" on public.wishlist_items;
create policy "wish: owner adds" on public.wishlist_items for insert to authenticated with check (owner_id = auth.uid() and public.is_member());
drop policy if exists "wish: owner edits" on public.wishlist_items;
create policy "wish: owner edits" on public.wishlist_items for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "wish: owner deletes" on public.wishlist_items;
create policy "wish: owner deletes" on public.wishlist_items for delete to authenticated using (owner_id = auth.uid());

create table if not exists public.wishlist_claims (
  item_id     uuid primary key references public.wishlist_items (id) on delete cascade,
  claimed_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  claimed_at  timestamptz not null default now()
);
alter table public.wishlist_claims enable row level security;
drop policy if exists "claims: only the claimer sees it" on public.wishlist_claims;
create policy "claims: only the claimer sees it" on public.wishlist_claims for select to authenticated using (claimed_by = auth.uid());
drop policy if exists "claims: claim the partner's wishes" on public.wishlist_claims;
create policy "claims: claim the partner's wishes" on public.wishlist_claims for insert to authenticated
  with check (claimed_by = auth.uid() and public.is_member()
    and exists (select 1 from public.wishlist_items w where w.id = item_id and w.owner_id <> auth.uid()));
drop policy if exists "claims: release own" on public.wishlist_claims;
create policy "claims: release own" on public.wishlist_claims for delete to authenticated using (claimed_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Shared notes with conflict detection (version)
-- ---------------------------------------------------------------------------
create table if not exists public.shared_notes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '' check (char_length(title) <= 120),
  body        text not null default '' check (char_length(body) <= 50000),
  pinned      boolean not null default false,
  color       text not null default 'cream' check (color in ('cream', 'rose', 'lavender', 'sage', 'ocean', 'peach')),
  version     int not null default 1,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
select public.member_crud('shared_notes');
revoke update on public.shared_notes from authenticated;
grant update (pinned, color) on public.shared_notes to authenticated;

create or replace function public.note_save(p_id uuid, p_title text, p_body text, p_version int)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  n public.shared_notes;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  update public.shared_notes set title = left(coalesce(p_title, ''), 120), body = left(coalesce(p_body, ''), 50000),
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = p_id and version = p_version
  returning * into n;
  if n.id is null then
    select * into n from public.shared_notes where id = p_id;
    if n.id is null then raise exception 'Notiz nicht gefunden'; end if;
    return jsonb_build_object('conflict', true, 'note', to_jsonb(n));
  end if;
  return jsonb_build_object('conflict', false, 'note', to_jsonb(n));
end;
$$;

-- ---------------------------------------------------------------------------
-- Voice notes: to the partner, or a private memo only for yourself.
-- ---------------------------------------------------------------------------
create table if not exists public.voice_notes (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id  uuid references public.profiles (id) on delete cascade,
  path          text not null check (char_length(path) <= 400),
  duration_ms   int not null check (duration_ms between 300 and 600000),
  waveform      smallint[] not null default '{}' check (cardinality(waveform) <= 64),
  title         text check (char_length(title) <= 80),
  listened_at   timestamptz,
  created_at    timestamptz not null default now(),
  check (recipient_id is null or recipient_id <> author_id),
  -- private memos live in the owner-only storage folder
  check ((recipient_id is null and path like author_id::text || '/private/voice/%') or (recipient_id is not null and path like author_id::text || '/voice/%'))
);
alter table public.voice_notes enable row level security;
drop policy if exists "voice: author and recipient read" on public.voice_notes;
create policy "voice: author and recipient read" on public.voice_notes for select to authenticated
  using (public.is_member() and (author_id = auth.uid() or recipient_id = auth.uid()));
drop policy if exists "voice: send as yourself" on public.voice_notes;
create policy "voice: send as yourself" on public.voice_notes for insert to authenticated with check (author_id = auth.uid() and public.is_member());
drop policy if exists "voice: author deletes" on public.voice_notes;
create policy "voice: author deletes" on public.voice_notes for delete to authenticated using (author_id = auth.uid());
revoke update on public.voice_notes from anon, authenticated;

create or replace function public.voice_listened(p_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.voice_notes set listened_at = coalesce(listened_at, now()) where id = p_id and recipient_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Photo of the day: you see today's photo of your partner once you posted yours.
-- ---------------------------------------------------------------------------
create table if not exists public.daily_photos (
  id          uuid primary key default gen_random_uuid(),
  day         date not null default public.berlin_today(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path        text not null check (char_length(path) <= 400),
  caption     text check (char_length(caption) <= 200),
  created_at  timestamptz not null default now(),
  unique (day, user_id)
);
alter table public.daily_photos enable row level security;

-- Helper (security definer, so the policy below does not query itself under RLS).
create or replace function public.posted_photo_on(d date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.daily_photos where user_id = auth.uid() and day = d);
$$;
revoke execute on function public.posted_photo_on(date) from public, anon;
grant execute on function public.posted_photo_on(date) to authenticated;

drop policy if exists "photo: own, past days, or after you posted" on public.daily_photos;
create policy "photo: own, past days, or after you posted" on public.daily_photos for select to authenticated
  using (public.is_member() and (
    user_id = auth.uid() or day < public.berlin_today()
    or public.posted_photo_on(day)
  ));
drop policy if exists "photo: post today as yourself" on public.daily_photos;
create policy "photo: post today as yourself" on public.daily_photos for insert to authenticated
  with check (user_id = auth.uid() and day = public.berlin_today() and public.is_member() and path like auth.uid()::text || '/photo/%');
drop policy if exists "photo: delete own" on public.daily_photos;
create policy "photo: delete own" on public.daily_photos for delete to authenticated using (user_id = auth.uid());
revoke update on public.daily_photos from anon, authenticated;

-- Whether the partner has posted today (without revealing the photo).
create or replace function public.daily_photo_status()
returns table (user_id uuid, posted boolean)
language sql stable security definer set search_path = ''
as $$
  select p.id, exists (select 1 from public.daily_photos d where d.user_id = p.id and d.day = public.berlin_today())
  from public.profiles p where public.is_member();
$$;

-- ---------------------------------------------------------------------------
-- Daily challenge: the same small challenge for both of you, every Berlin day.
-- ---------------------------------------------------------------------------
create table if not exists public.challenges (
  id        int primary key,
  body      text not null,
  category  text not null check (category in ('sweet', 'talk', 'fun', 'care', 'create'))
);
alter table public.challenges enable row level security;
drop policy if exists "challenges: members read" on public.challenges;
create policy "challenges: members read" on public.challenges for select to authenticated using (public.is_member());
revoke insert, update, delete on public.challenges from anon, authenticated;

insert into public.challenges (id, body, category) values
  (1, 'Schick ein Foto von etwas, das dich heute an den anderen erinnert hat.', 'sweet'),
  (2, 'Erzähl von einem Moment aus dieser Woche, in dem du stolz auf den anderen warst.', 'talk'),
  (3, 'Schreibt beide drei Dinge auf, die ihr am anderen liebt, ohne euch abzusprechen. Dann vergleichen.', 'sweet'),
  (4, 'Plant zusammen ein Mini-Date für diese Woche, auch wenn es nur 20 Minuten sind.', 'fun'),
  (5, 'Schickt euch gegenseitig ein Lied, das gerade eure Stimmung beschreibt.', 'create'),
  (6, 'Frag den anderen: Was war heute schwer für dich? Und hör einfach zu.', 'care'),
  (7, 'Macht ein Selfie mit derselben Grimasse.', 'fun'),
  (8, 'Erinnert euch an euer erstes Gespräch. Was weiß jeder noch davon?', 'talk'),
  (9, 'Schreib eine Sprachnachricht mit einem Kompliment, das du noch nie gesagt hast.', 'sweet'),
  (10, 'Kocht heute das Gleiche, auch wenn ihr nicht zusammen seid, und vergleicht die Ergebnisse.', 'fun'),
  (11, 'Teilt einen Traum für die Zukunft, den ihr dem anderen noch nicht erzählt habt.', 'talk'),
  (12, 'Schreib einen kurzen Brief „Öffnen, wenn du müde bist“.', 'create'),
  (13, 'Fragt euch: Wann hast du dich zuletzt richtig geliebt gefühlt?', 'talk'),
  (14, 'Geht heute fünf Minuten spazieren und schickt euch ein Foto vom Himmel.', 'care'),
  (15, 'Erstellt zusammen eine Playlist mit fünf Songs für eure nächste Autofahrt.', 'create'),
  (16, 'Sag dem anderen, wofür du heute dankbar bist.', 'sweet'),
  (17, 'Spielt eine Runde in „Play“ und der Verlierer schreibt ein Gedicht.', 'fun'),
  (18, 'Erzählt euch von einer Kindheitserinnerung, die der andere noch nicht kennt.', 'talk'),
  (19, 'Schreib dem anderen eine Erinnerung für morgen früh, Wasser trinken inklusive.', 'care'),
  (20, 'Zeichnet euch gegenseitig in 60 Sekunden und schickt die Bilder.', 'create'),
  (21, 'Nennt drei Orte, an die ihr unbedingt zusammen reisen wollt.', 'talk'),
  (22, 'Mach ein Foto von deinem Lieblingsplatz zu Hause und erzähl warum.', 'sweet'),
  (23, 'Findet heraus, welcher Film euch beiden als Kind Angst gemacht hat.', 'fun'),
  (24, 'Fragt euch: Was kann ich diese Woche für dich leichter machen?', 'care'),
  (25, 'Schreibt zusammen eine Geschichte: Jeder schreibt abwechselnd einen Satz.', 'create'),
  (26, 'Schick dem anderen ein Foto von etwas Schönem, das du heute gesehen hast.', 'sweet'),
  (27, 'Erzählt euch eure perfekte Sonntagsroutine.', 'talk'),
  (28, 'Macht heute Abend zur gleichen Zeit eine Tasse Tee und telefoniert dabei.', 'care'),
  (29, 'Ratet gegenseitig das Lieblingsessen des anderen aus der Kindheit.', 'fun'),
  (30, 'Gestaltet zusammen eine Seite auf eurem Moodboard.', 'create'),
  (31, 'Schreib in einem Satz auf, warum du dich in den anderen verliebt hast.', 'sweet'),
  (32, 'Teilt ein Ziel für diesen Monat und wie der andere helfen kann.', 'talk'),
  (33, 'Schickt euch ein Bild eures aktuellen Ausblicks.', 'fun'),
  (34, 'Sag dem anderen etwas Liebes über sich, das er oft vergisst.', 'care'),
  (35, 'Erfindet einen gemeinsamen Insider-Spitznamen für eure Lieblingsbeschäftigung.', 'create'),
  (36, 'Erzählt euch, welches Geräusch euch an Zuhause erinnert.', 'talk'),
  (37, 'Schick eine Sprachnachricht, in der du deinen Tag in 30 Sekunden erzählst.', 'sweet'),
  (38, 'Wählt zusammen den nächsten Film für eure Watchlist.', 'fun'),
  (39, 'Fragt euch: Was brauchst du gerade mehr: Ruhe, Abenteuer oder Kuscheln?', 'care'),
  (40, 'Schreibt eine Zeitkapsel-Nachricht an euch in einem Jahr.', 'create')
on conflict (id) do update set body = excluded.body, category = excluded.category;

create table if not exists public.challenge_done (
  day           date not null default public.berlin_today(),
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  challenge_id  int not null references public.challenges (id),
  note          text check (char_length(note) <= 280),
  created_at    timestamptz not null default now(),
  primary key (day, user_id)
);
alter table public.challenge_done enable row level security;
drop policy if exists "challenge: members read" on public.challenge_done;
create policy "challenge: members read" on public.challenge_done for select to authenticated using (public.is_member());
revoke insert, update, delete on public.challenge_done from anon, authenticated;

create or replace function public.challenge_today()
returns public.challenges
language sql stable security definer set search_path = ''
as $$
  -- A fixed shuffle of the pool by day, so both of you get the same one and it rarely repeats.
  select c.* from public.challenges c
  where public.is_member()
  order by md5(public.berlin_today()::text || c.id::text)
  limit 1;
$$;

create or replace function public.challenge_complete(p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  c public.challenges;
begin
  if auth.uid() is null or not public.is_member() then raise exception 'not a member' using errcode = '42501'; end if;
  c := public.challenge_today();
  insert into public.challenge_done (day, user_id, challenge_id, note) values (public.berlin_today(), auth.uid(), c.id, left(nullif(btrim(p_note), ''), 280))
  on conflict (day, user_id) do update set note = excluded.note;
  perform public.log_activity(auth.uid(), 'challenge', public.berlin_today()::text, 'hat die Tages-Challenge geschafft');
end;
$$;

-- ---------------------------------------------------------------------------
-- Reminders: anniversaries (from couple_settings.start_date), countdowns, capsules.
-- Runs hourly via pg_cron and acts at 08:00 Berlin time. Idempotent per day.
-- ---------------------------------------------------------------------------
create or replace function public.couple_daily()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  today date := public.berlin_today();
  start date;
  years int;
  months int;
  n int := 0;
  r record;
begin
  select start_date into start from public.couple_settings limit 1;
  if start is not null and start < today then
    years := extract(year from age(today, start))::int;
    months := (extract(year from age(today, start)) * 12 + extract(month from age(today, start)))::int;
    if extract(month from today) = extract(month from start) and extract(day from today) = extract(day from start) and years > 0 then
      insert into public.couple_reminders (day, kind, ref, title) values (today, 'anniversary', years::text, years || ' Jahr' || case when years = 1 then '' else 'e' end || ' ihr zwei ♡')
      on conflict do nothing;
      n := n + 1;
    elsif extract(day from today) = extract(day from start) and months > 0 then
      insert into public.couple_reminders (day, kind, ref, title) values (today, 'monthiversary', months::text, months || ' Monate zusammen ♡')
      on conflict do nothing;
      n := n + 1;
    end if;
  end if;
  for r in select id, title, emoji from public.countdowns where notify and (target_at at time zone 'Europe/Berlin')::date = today loop
    insert into public.couple_reminders (day, kind, ref, title) values (today, 'countdown', r.id::text, r.emoji || ' Heute: ' || left(r.title, 100)) on conflict do nothing;
    n := n + 1;
  end loop;
  for r in select id, title from public.time_capsules where (open_at at time zone 'Europe/Berlin')::date = today loop
    insert into public.couple_reminders (day, kind, ref, title) values (today, 'capsule', r.id::text, '⏳ Eine Zeitkapsel öffnet sich heute: ' || left(r.title, 80)) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.couple_daily() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ours-couple-daily';
    perform cron.schedule('ours-couple-daily', '5 * * * *', $cron$
      select public.couple_daily() where extract(hour from (now() at time zone 'Europe/Berlin')) = 8;
    $cron$);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Functions: who may call what
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['capsule_create(text, timestamptz, text, text[])', 'capsule_mark_opened(uuid)', 'note_save(uuid, text, text, int)',
    'voice_listened(uuid)', 'daily_photo_status()', 'challenge_today()', 'challenge_complete(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Push (the push function decides who gets what) and Realtime
-- ---------------------------------------------------------------------------
drop trigger if exists push_calendar on public.calendar_events;
create trigger push_calendar after insert on public.calendar_events for each row execute function public.push_on_insert('calendar');
drop trigger if exists push_voice on public.voice_notes;
create trigger push_voice after insert on public.voice_notes for each row when (new.recipient_id is not null) execute function public.push_on_insert('voice');
drop trigger if exists push_photo on public.daily_photos;
create trigger push_photo after insert on public.daily_photos for each row execute function public.push_on_insert('photo');
drop trigger if exists push_capsule on public.time_capsules;
create trigger push_capsule after insert on public.time_capsules for each row execute function public.push_on_insert('capsule');
drop trigger if exists push_reminder on public.couple_reminders;
create trigger push_reminder after insert on public.couple_reminders for each row execute function public.push_on_insert('reminder');

do $$
declare
  t text;
begin
  foreach t in array array['calendar_events', 'countdowns', 'time_capsules', 'places', 'moodboard_items', 'goals', 'goal_steps',
    'watch_items', 'watch_ratings', 'wishlist_items', 'shared_notes', 'voice_notes', 'daily_photos', 'challenge_done', 'couple_reminders'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
