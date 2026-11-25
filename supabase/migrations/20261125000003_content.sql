-- ours. — memories, diary, letters, dates, questions, games, music, surprises, uploads

-- Memories --------------------------------------------------------------------
create table public.memories (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  description text check (char_length(description) <= 4000),
  happened_on date,
  location    text check (char_length(location) <= 140),
  category    text not null default 'alltag' check (category in ('date', 'reise', 'alltag', 'meilenstein', 'feier', 'sonstiges')),
  is_favorite boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.memories enable row level security;
create index memories_happened_on on public.memories (happened_on desc nulls last, created_at desc);
create trigger memories_updated_at before update on public.memories
  for each row execute function public.set_updated_at();

create policy "members read memories" on public.memories
  for select to authenticated using (public.is_member());
create policy "members create memories" on public.memories
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy "members edit memories" on public.memories
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "creator deletes memory" on public.memories
  for delete to authenticated using (created_by = auth.uid());
revoke update on public.memories from authenticated;
grant update (title, description, happened_on, location, category, is_favorite) on public.memories to authenticated;

create table public.memory_media (
  id         uuid primary key default gen_random_uuid(),
  memory_id  uuid not null references public.memories (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  path       text not null unique check (char_length(path) <= 400),
  kind       text not null check (kind in ('image', 'video')),
  width      integer check (width > 0),
  height     integer check (height > 0),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.memory_media enable row level security;
create index memory_media_memory on public.memory_media (memory_id, position);

create policy "members read memory media" on public.memory_media
  for select to authenticated using (public.is_member());
create policy "members add own media" on public.memory_media
  for insert to authenticated with check (
    public.is_member() and created_by = auth.uid()
    and split_part(path, '/', 1) = auth.uid()::text
  );
create policy "members remove memory media" on public.memory_media
  for delete to authenticated using (public.is_member());

create table public.memory_comments (
  id         uuid primary key default gen_random_uuid(),
  memory_id  uuid not null references public.memories (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.memory_comments enable row level security;
create index memory_comments_memory on public.memory_comments (memory_id, created_at);

create policy "members read memory comments" on public.memory_comments
  for select to authenticated using (public.is_member());
create policy "members comment as themselves" on public.memory_comments
  for insert to authenticated with check (public.is_member() and author_id = auth.uid());
create policy "authors delete own memory comments" on public.memory_comments
  for delete to authenticated using (author_id = auth.uid());

-- Diary -----------------------------------------------------------------------
-- visibility: private = only the author, mine = author's entry visible to both,
-- ours = shared entry both can edit.
create table public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title       text check (char_length(title) <= 140),
  body        text not null check (char_length(btrim(body)) between 1 and 20000),
  mood        text check (mood in ('happy', 'inlove', 'calm', 'grateful', 'tired', 'sad', 'stressed', 'excited', 'missing')),
  visibility  text not null default 'mine' check (visibility in ('private', 'mine', 'ours')),
  entry_at    timestamptz not null default now(),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 6),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.diary_entries enable row level security;
create index diary_entries_entry_at on public.diary_entries (entry_at desc);
create trigger diary_entries_updated_at before update on public.diary_entries
  for each row execute function public.set_updated_at();

create policy "read own or shared diary entries" on public.diary_entries
  for select to authenticated using (
    author_id = auth.uid() or (visibility <> 'private' and public.is_member())
  );
create policy "write own diary entries" on public.diary_entries
  for insert to authenticated with check (public.is_member() and author_id = auth.uid());
create policy "edit own or our diary entries" on public.diary_entries
  for update to authenticated
  using (author_id = auth.uid() or (visibility = 'ours' and public.is_member()))
  with check (author_id = auth.uid() or (visibility = 'ours' and public.is_member()));
create policy "delete own diary entries" on public.diary_entries
  for delete to authenticated using (author_id = auth.uid());
revoke update on public.diary_entries from authenticated;
grant update (title, body, mood, visibility, entry_at, image_paths) on public.diary_entries to authenticated;

-- Only the author may change the visibility of an entry.
create or replace function public.diary_guard_visibility()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.visibility is distinct from old.visibility and old.author_id <> auth.uid() then
    raise exception 'Nur der Autor kann die Sichtbarkeit ändern';
  end if;
  return new;
end;
$$;
create trigger diary_guard_visibility before update on public.diary_entries
  for each row execute function public.diary_guard_visibility();

create table public.diary_comments (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.diary_entries (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.diary_comments enable row level security;

-- The subquery is itself filtered by diary_entries RLS, so comments on
-- private entries stay private as well.
create policy "read comments on visible entries" on public.diary_comments
  for select to authenticated using (
    public.is_member() and exists (select 1 from public.diary_entries e where e.id = entry_id)
  );
create policy "comment on visible entries" on public.diary_comments
  for insert to authenticated with check (
    author_id = auth.uid() and public.is_member()
    and exists (select 1 from public.diary_entries e where e.id = entry_id)
  );
create policy "delete own diary comments" on public.diary_comments
  for delete to authenticated using (author_id = auth.uid());

-- Love letters ----------------------------------------------------------------
create table public.love_letters (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  recipient_id uuid references public.profiles (id) on delete cascade, -- null = shared letter for both
  category     text not null check (category in ('miss', 'sad', 'sleep', 'happy', 'hug', 'smile', 'love', 'anytime')),
  title        text not null check (char_length(btrim(title)) between 1 and 140),
  body         text not null check (char_length(btrim(body)) between 1 and 20000),
  image_path   text check (char_length(image_path) <= 400),
  open_at      timestamptz,
  opened_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint letter_not_to_self check (recipient_id is null or recipient_id <> author_id)
);
alter table public.love_letters enable row level security;
create trigger love_letters_updated_at before update on public.love_letters
  for each row execute function public.set_updated_at();

create policy "read letters you wrote or that are open for you" on public.love_letters
  for select to authenticated using (
    author_id = auth.uid()
    or (
      public.is_member()
      and (recipient_id = auth.uid() or recipient_id is null)
      and (open_at is null or open_at <= now())
    )
  );
create policy "write letters as yourself" on public.love_letters
  for insert to authenticated with check (
    public.is_member() and author_id = auth.uid() and opened_at is null
    and (image_path is null or split_part(image_path, '/', 1) = auth.uid()::text)
  );
create policy "authors edit their letters" on public.love_letters
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete their letters" on public.love_letters
  for delete to authenticated using (author_id = auth.uid());
revoke update on public.love_letters from authenticated;
grant update (category, title, body, image_path, open_at, recipient_id) on public.love_letters to authenticated;

-- Sealed letters: only metadata, never title or body, until open_at.
create or replace function public.sealed_letters()
returns table (id uuid, author_id uuid, recipient_id uuid, category text, open_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select l.id, l.author_id, l.recipient_id, l.category, l.open_at, l.created_at
  from public.love_letters l
  where public.is_member()
    and l.author_id <> auth.uid()
    and (l.recipient_id = auth.uid() or l.recipient_id is null)
    and l.open_at > now()
  order by l.open_at;
$$;

create or replace function public.mark_letter_opened(letter_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.love_letters
  set opened_at = coalesce(opened_at, now())
  where id = letter_id
    and author_id <> auth.uid()
    and (recipient_id = auth.uid() or recipient_id is null)
    and (open_at is null or open_at <= now())
    and public.is_member();
$$;

-- Date planner ----------------------------------------------------------------
create table public.date_ideas (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  description text check (char_length(description) <= 2000),
  category    text not null default 'aktivitaet' check (category in ('restaurant', 'kino', 'reise', 'aktivitaet', 'zuhause', 'sonstiges')),
  status      text not null default 'idee' check (status in ('idee', 'geplant', 'erledigt')),
  planned_for timestamptz,
  location    text check (char_length(location) <= 140),
  link        text check (link is null or link ~ '^https?://'),
  is_favorite boolean not null default false,
  reminder    boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.date_ideas enable row level security;
create trigger date_ideas_updated_at before update on public.date_ideas
  for each row execute function public.set_updated_at();

create policy "members read date ideas" on public.date_ideas
  for select to authenticated using (public.is_member());
create policy "members add date ideas" on public.date_ideas
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy "members edit date ideas" on public.date_ideas
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "members delete date ideas" on public.date_ideas
  for delete to authenticated using (public.is_member());
revoke update on public.date_ideas from authenticated;
grant update (title, description, category, status, planned_for, location, link, is_favorite, reminder)
  on public.date_ideas to authenticated;

create table public.date_votes (
  idea_id    uuid not null references public.date_ideas (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
alter table public.date_votes enable row level security;
alter table public.date_votes replica identity full;

create policy "members read votes" on public.date_votes
  for select to authenticated using (public.is_member());
create policy "vote as yourself" on public.date_votes
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy "change own vote" on public.date_votes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "remove own vote" on public.date_votes
  for delete to authenticated using (user_id = auth.uid());

-- Daily questions -------------------------------------------------------------
create table public.daily_questions (
  id         bigint generated always as identity primary key,
  question   text not null unique check (char_length(btrim(question)) between 3 and 240),
  added_by   uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.daily_questions enable row level security;

create policy "members read questions" on public.daily_questions
  for select to authenticated using (public.is_member());
create policy "members add questions" on public.daily_questions
  for insert to authenticated with check (public.is_member() and added_by = auth.uid());

create table public.question_schedule (
  day         date primary key,
  question_id bigint not null references public.daily_questions (id) on delete cascade
);
alter table public.question_schedule enable row level security;
create policy "members read schedule" on public.question_schedule
  for select to authenticated using (public.is_member());

create table public.question_answers (
  id          uuid primary key default gen_random_uuid(),
  question_id bigint not null references public.daily_questions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  day         date not null default public.berlin_today(),
  answer      text not null check (char_length(btrim(answer)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (question_id, user_id, day)
);
alter table public.question_answers enable row level security;
create trigger question_answers_updated_at before update on public.question_answers
  for each row execute function public.set_updated_at();

create or replace function public.has_answered(q_id bigint, q_day date)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.question_answers a
    where a.question_id = q_id and a.day = q_day and a.user_id = auth.uid()
  );
$$;

create policy "see own answers, and partner answers once you answered too" on public.question_answers
  for select to authenticated using (
    user_id = auth.uid() or (public.is_member() and public.has_answered(question_id, day))
  );
create policy "answer as yourself" on public.question_answers
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy "edit own answer" on public.question_answers
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.question_answers from authenticated;
grant update (answer) on public.question_answers to authenticated;

-- Picks (and remembers) the question for a given Berlin day.
create or replace function public.question_for_day(q_day date default public.berlin_today())
returns table (day date, question_id bigint, question text)
language plpgsql security definer set search_path = ''
as $$
declare
  qid bigint;
begin
  if not public.is_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if q_day > public.berlin_today() then
    raise exception 'Zukünftige Fragen bleiben geheim';
  end if;

  select s.question_id into qid from public.question_schedule s where s.day = q_day;
  if qid is null then
    select q.id into qid
    from public.daily_questions q
    left join public.question_schedule s on s.question_id = q.id
    group by q.id
    order by count(s.day), random()
    limit 1;
    if qid is null then
      return;
    end if;
    insert into public.question_schedule (day, question_id) values (q_day, qid)
    on conflict on constraint question_schedule_pkey do nothing;
    select s.question_id into qid from public.question_schedule s where s.day = q_day;
  end if;

  return query
    select q_day, q.id, q.question from public.daily_questions q where q.id = qid;
end;
$$;

-- Who has answered (without revealing the answer text).
create or replace function public.question_progress(q_day date default public.berlin_today())
returns table (user_id uuid, answered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select a.user_id, a.created_at
  from public.question_answers a
  join public.question_schedule s on s.day = a.day and s.question_id = a.question_id
  where a.day = q_day and public.is_member();
$$;

-- Mini games ------------------------------------------------------------------
-- game: aboutme (answer about yourself) <-> guess (guess the partner's answer),
--       likely (who is more likely to), thisorthat.
create table public.game_responses (
  game       text not null check (game in ('aboutme', 'guess', 'likely', 'thisorthat')),
  prompt_key text not null check (char_length(prompt_key) between 1 and 80),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  value      text not null check (char_length(value) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (game, prompt_key, user_id)
);
alter table public.game_responses enable row level security;

create or replace function public.game_counterpart(g text)
returns text
language sql immutable set search_path = ''
as $$
  select case g when 'aboutme' then 'guess' when 'guess' then 'aboutme' else g end;
$$;

create or replace function public.has_game_response(g text, k text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.game_responses r
    where r.game = g and r.prompt_key = k and r.user_id = auth.uid()
  );
$$;

create policy "see own responses, partner's only after you played" on public.game_responses
  for select to authenticated using (
    user_id = auth.uid()
    or (public.is_member() and public.has_game_response(public.game_counterpart(game), prompt_key))
  );
create policy "play as yourself" on public.game_responses
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy "change own response" on public.game_responses
  for update to authenticated using (user_id = auth.uid() and game in ('likely', 'thisorthat', 'aboutme'))
  with check (user_id = auth.uid());
create policy "reset own response" on public.game_responses
  for delete to authenticated using (user_id = auth.uid());
-- Upserts need update rights on every column; RLS keeps them on your own rows.

create or replace function public.game_progress()
returns table (game text, prompt_key text, user_id uuid)
language sql stable security definer set search_path = ''
as $$
  select r.game, r.prompt_key, r.user_id from public.game_responses r where public.is_member();
$$;

create table public.game_scores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  game       text not null check (char_length(game) <= 40),
  score      integer not null check (score >= 0),
  total      integer not null check (total > 0 and score <= total),
  created_at timestamptz not null default now()
);
alter table public.game_scores enable row level security;
create policy "members read scores" on public.game_scores
  for select to authenticated using (public.is_member());
create policy "save own score" on public.game_scores
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());

-- Music -----------------------------------------------------------------------
create table public.songs (
  id         uuid primary key default gen_random_uuid(),
  added_by   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  title      text not null check (char_length(btrim(title)) between 1 and 140),
  artist     text not null check (char_length(btrim(artist)) between 1 and 140),
  url        text check (url is null or url ~ '^https://(open\.spotify\.com|music\.apple\.com|(www\.|music\.)?youtube\.com|youtu\.be|soundcloud\.com)/'),
  dedication text check (char_length(dedication) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.songs enable row level security;
create policy "members read songs" on public.songs
  for select to authenticated using (public.is_member());
create policy "add songs as yourself" on public.songs
  for insert to authenticated with check (public.is_member() and added_by = auth.uid());
create policy "edit own songs" on public.songs
  for update to authenticated using (added_by = auth.uid()) with check (added_by = auth.uid());
create policy "delete own songs" on public.songs
  for delete to authenticated using (added_by = auth.uid());
revoke update on public.songs from authenticated;
grant update (title, artist, url, dedication) on public.songs to authenticated;

-- Surprises -------------------------------------------------------------------
create table public.surprises (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind         text not null default 'gift' check (kind in ('gift', 'message', 'hidden')),
  wrap         text not null default 'cherry' check (wrap in ('cherry', 'blush', 'midnight', 'gold')),
  title        text not null check (char_length(btrim(title)) between 1 and 140),
  body         text not null check (char_length(btrim(body)) between 1 and 4000),
  image_path   text check (char_length(image_path) <= 400),
  reveal_at    timestamptz not null default now(),
  opened_at    timestamptz,
  created_at   timestamptz not null default now(),
  constraint surprise_not_to_self check (recipient_id <> author_id)
);
alter table public.surprises enable row level security;

create policy "authors and revealed recipients read surprises" on public.surprises
  for select to authenticated using (
    author_id = auth.uid() or (recipient_id = auth.uid() and reveal_at <= now() and public.is_member())
  );
create policy "create surprises for your partner" on public.surprises
  for insert to authenticated with check (
    public.is_member() and author_id = auth.uid() and recipient_id = public.partner_id() and opened_at is null
    and (image_path is null or split_part(image_path, '/', 1) = auth.uid()::text)
  );
create policy "authors edit surprises" on public.surprises
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete surprises" on public.surprises
  for delete to authenticated using (author_id = auth.uid());
revoke update on public.surprises from authenticated;
grant update (kind, wrap, title, body, image_path, reveal_at) on public.surprises to authenticated;

create or replace function public.sealed_surprises()
returns table (id uuid, author_id uuid, kind text, wrap text, reveal_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.author_id, s.kind, s.wrap, s.reveal_at, s.created_at
  from public.surprises s
  where public.is_member() and s.recipient_id = auth.uid() and s.reveal_at > now()
  order by s.reveal_at;
$$;

create or replace function public.mark_surprise_opened(surprise_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.surprises set opened_at = coalesce(opened_at, now())
  where id = surprise_id and recipient_id = auth.uid() and reveal_at <= now() and public.is_member();
$$;

-- Uploads registry ------------------------------------------------------------
create table public.uploads (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  bucket     text not null default 'media' check (bucket = 'media'),
  path       text not null unique check (char_length(path) <= 400),
  area       text not null check (area in ('chat', 'memories', 'diary', 'letters', 'surprises', 'avatars', 'backgrounds', 'private')),
  mime_type  text not null check (char_length(mime_type) <= 100),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at timestamptz not null default now()
);
alter table public.uploads enable row level security;

create policy "members read shared uploads, owners read private" on public.uploads
  for select to authenticated using (
    owner_id = auth.uid() or (public.is_member() and split_part(path, '/', 2) <> 'private')
  );
create policy "register own uploads" on public.uploads
  for insert to authenticated with check (
    public.is_member() and owner_id = auth.uid() and split_part(path, '/', 1) = auth.uid()::text
  );
create policy "delete own uploads" on public.uploads
  for delete to authenticated using (owner_id = auth.uid());

-- Function privileges ----------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.sealed_letters()', 'public.mark_letter_opened(uuid)',
    'public.has_answered(bigint, date)', 'public.question_for_day(date)', 'public.question_progress(date)',
    'public.has_game_response(text, text)', 'public.game_progress()',
    'public.sealed_surprises()', 'public.mark_surprise_opened(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
