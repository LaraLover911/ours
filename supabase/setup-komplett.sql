-- ours. — komplettes Datenbank-Schema. Einmal komplett im Supabase SQL Editor ausführen.

-- ===== 20261125000001_core.sql =====
-- ours. — core schema: invitations, profiles, couple settings, helpers
-- Only two people (Abdullah & Lara) can ever have a profile.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Invitations (allowlist). Managed only via SQL editor / service role.
-- ---------------------------------------------------------------------------
create table public.invites (
  email        text primary key check (email = lower(email) and position('@' in email) > 1),
  role         text not null unique check (role in ('abdullah', 'lara')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.invites enable row level security;
-- No policies: clients can never read or write the allowlist.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            text not null unique check (role in ('abdullah', 'lara')),
  display_name    text not null check (char_length(display_name) between 1 and 40),
  bio             text check (char_length(bio) <= 280),
  avatar_path     text check (char_length(avatar_path) <= 300),
  accent          text not null default 'cherry' check (accent in ('cherry', 'rose', 'lavender', 'sage', 'ocean', 'peach')),
  theme           text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notify_messages boolean not null default true,
  show_online     boolean not null default true,
  read_receipts   boolean not null default true,
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can be used inside policies
-- without recursive RLS evaluation).
-- ---------------------------------------------------------------------------
create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

create or replace function public.partner_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p
  where auth.uid() is not null
    and exists (select 1 from public.profiles me where me.id = auth.uid())
    and p.id <> auth.uid()
  limit 1;
$$;

create or replace function public.berlin_today()
returns date
language sql stable set search_path = ''
as $$
  select (now() at time zone 'Europe/Berlin')::date;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.is_member() from public, anon;
revoke execute on function public.partner_id() from public, anon;
grant execute on function public.is_member() to authenticated;
grant execute on function public.partner_id() to authenticated;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profile policies
create policy "members can read both profiles" on public.profiles
  for select to authenticated using (public.is_member());

create policy "users update only their own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Role and id can never be changed by clients.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_path, accent, theme, notify_messages,
              show_online, read_receipts, last_seen_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Signup guard: only invited emails, and never more than two people.
-- Raising here aborts the auth.users insert, so the signup fails.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invites%rowtype;
begin
  select * into inv from public.invites i where i.email = lower(new.email);
  if not found then
    raise exception 'ours: % ist nicht eingeladen', new.email using errcode = '42501';
  end if;
  if (select count(*) from public.profiles) >= 2 then
    raise exception 'ours: es gibt bereits zwei Profile' using errcode = '42501';
  end if;

  insert into public.profiles (id, role, display_name)
  values (new.id, inv.role, inv.display_name);

  update public.invites set accepted_at = now() where email = inv.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the email change path closed to uninvited addresses as well.
create or replace function public.guard_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is distinct from old.email
     and not exists (select 1 from public.invites i where i.email = lower(new.email)) then
    raise exception 'ours: neue E-Mail ist nicht eingeladen' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_change
  before update of email on auth.users
  for each row execute function public.guard_email_change();

-- ---------------------------------------------------------------------------
-- Couple settings (single row)
-- ---------------------------------------------------------------------------
create table public.couple_settings (
  id                   smallint primary key default 1 check (id = 1),
  start_date           date,
  home_message         text check (char_length(home_message) <= 280),
  home_message_by      uuid references public.profiles (id) on delete set null,
  spotify_playlist_url text check (spotify_playlist_url is null or spotify_playlist_url ~ '^https://open\.spotify\.com/'),
  hero_image           text check (char_length(hero_image) <= 400),
  background_image     text check (char_length(background_image) <= 400),
  updated_by           uuid references public.profiles (id) on delete set null,
  updated_at           timestamptz not null default now()
);
alter table public.couple_settings enable row level security;
insert into public.couple_settings (id) values (1);

create trigger couple_settings_updated_at before update on public.couple_settings
  for each row execute function public.set_updated_at();

create policy "members read settings" on public.couple_settings
  for select to authenticated using (public.is_member());
create policy "members update settings" on public.couple_settings
  for update to authenticated using (public.is_member()) with check (public.is_member());

revoke insert, delete on public.couple_settings from anon, authenticated;

-- ===== 20261125000002_chat.sql =====
-- ours. — realtime messenger

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 60),
  emoji           text check (char_length(emoji) <= 8),
  is_default      boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.conversations enable row level security;
create unique index conversations_one_default on public.conversations (is_default) where is_default;

insert into public.conversations (title, emoji, is_default, created_by) values ('just us', '♡', true, null);

create policy "members read conversations" on public.conversations
  for select to authenticated using (public.is_member());
create policy "members create conversations" on public.conversations
  for insert to authenticated with check (public.is_member() and created_by = auth.uid() and not is_default);
create policy "members rename conversations" on public.conversations
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "creator deletes own non-default conversation" on public.conversations
  for delete to authenticated using (created_by = auth.uid() and not is_default);
revoke update on public.conversations from authenticated;
grant update (title, emoji) on public.conversations to authenticated;

-- Messages --------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  kind            text not null default 'text' check (kind in ('text', 'image', 'video', 'audio')),
  body            text check (char_length(body) <= 4000),
  attachment_path text check (char_length(attachment_path) <= 400),
  attachment_meta jsonb not null default '{}'::jsonb,
  reply_to_id     uuid references public.messages (id) on delete set null,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint message_has_content check (
    deleted_at is not null
    or (kind = 'text' and char_length(btrim(coalesce(body, ''))) > 0)
    or (kind <> 'text' and attachment_path is not null)
  )
);
alter table public.messages enable row level security;
create index messages_conversation_created on public.messages (conversation_id, created_at desc);
create index messages_body_search on public.messages using gin (to_tsvector('simple', coalesce(body, '')));

create policy "members read messages" on public.messages
  for select to authenticated using (public.is_member());
create policy "members send as themselves" on public.messages
  for insert to authenticated with check (
    public.is_member()
    and sender_id = auth.uid()
    and edited_at is null and deleted_at is null
    and (attachment_path is null or split_part(attachment_path, '/', 1) = auth.uid()::text)
  );
create policy "senders edit or delete own messages" on public.messages
  for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());
create policy "senders hard delete own messages" on public.messages
  for delete to authenticated using (sender_id = auth.uid());
revoke update on public.messages from authenticated;
grant update (body, edited_at, deleted_at) on public.messages to authenticated;

-- Server-side guards for edits and soft deletes.
create or replace function public.messages_before_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'Gelöschte Nachrichten können nicht geändert werden';
  end if;
  if new.deleted_at is not null then
    new.body = null;
    new.attachment_meta = jsonb_build_object('deleted_kind', old.kind);
    new.deleted_at = now();
  elsif new.body is distinct from old.body then
    if old.kind <> 'text' and new.body is null then
      new.body = null;
    end if;
    new.edited_at = now();
  end if;
  return new;
end;
$$;
create trigger messages_before_update before update on public.messages
  for each row execute function public.messages_before_update();

create or replace function public.messages_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  -- Sending a message means you have read everything before it.
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (new.conversation_id, new.sender_id, new.created_at)
  on conflict (conversation_id, user_id)
    do update set last_read_at = greatest(public.conversation_reads.last_read_at, excluded.last_read_at);
  return new;
end;
$$;

-- Read state ------------------------------------------------------------------
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
alter table public.conversation_reads enable row level security;

create policy "members read read-state" on public.conversation_reads
  for select to authenticated using (public.is_member());
create policy "users write own read-state" on public.conversation_reads
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy "users update own read-state" on public.conversation_reads
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

-- Reactions -------------------------------------------------------------------
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;
alter table public.message_reactions replica identity full;

create policy "members read reactions" on public.message_reactions
  for select to authenticated using (public.is_member());
create policy "users react as themselves" on public.message_reactions
  for insert to authenticated with check (user_id = auth.uid() and public.is_member());
create policy "users remove own reactions" on public.message_reactions
  for delete to authenticated using (user_id = auth.uid());

-- Unread counts per conversation for the current user.
create or replace function public.unread_counts()
returns table (conversation_id uuid, unread bigint)
language sql stable security invoker set search_path = ''
as $$
  select c.id, count(m.id)
  from public.conversations c
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  left join public.messages m on m.conversation_id = c.id
    and m.sender_id <> auth.uid()
    and m.deleted_at is null
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
  group by c.id;
$$;
revoke execute on function public.unread_counts() from public, anon;
grant execute on function public.unread_counts() to authenticated;

-- ===== 20261125000003_content.sql =====
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

-- ===== 20261125000004_storage_realtime.sql =====
-- ours. — private storage bucket and realtime configuration

-- Private bucket: files are only reachable through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/aac', 'audio/x-m4a'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout: <user_id>/<area>/<file>. "<user_id>/private/..." is owner-only.
create policy "ours: members read shared media, owners read private media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and public.is_member()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[2] is distinct from 'private'
    )
  );

create policy "ours: members upload into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.is_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "ours: owners update their files"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "ours: owners delete their files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Realtime: database change streams (RLS is applied per subscriber).
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'profiles', 'couple_settings', 'conversations', 'messages', 'message_reactions', 'conversation_reads',
    'memories', 'memory_media', 'memory_comments', 'diary_entries', 'diary_comments', 'love_letters',
    'date_ideas', 'date_votes', 'question_answers', 'game_responses', 'songs', 'surprises'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Realtime: private broadcast/presence channels (typing, online status).
-- Only the two members may join topics that start with "ours:".
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy "ours: members receive broadcast and presence"
        on realtime.messages for select to authenticated
        using (public.is_member() and (select realtime.topic()) like 'ours:%')
    $p$;
    execute $p$
      create policy "ours: members send broadcast and presence"
        on realtime.messages for insert to authenticated
        with check (public.is_member() and (select realtime.topic()) like 'ours:%')
    $p$;
  end if;
end $$;

-- ===== 20261125000005_question_pool.sql =====
-- ours. — question pool for daily questions (content, not memories)

insert into public.daily_questions (question) values
  ('What was your favorite moment with me?'),
  ('What do you miss most about me when we''re apart?'),
  ('Where should we travel together?'),
  ('What''s one thing I do that makes you smile?'),
  ('What''s your dream date?'),
  ('What is your favorite memory of us?'),
  ('When did you first realize you liked me?'),
  ('What song makes you think of me?'),
  ('What''s something small I did that meant a lot to you?'),
  ('What''s one thing you want us to try together this year?'),
  ('What''s your favorite thing about our conversations?'),
  ('If we had a whole free day tomorrow, what would we do?'),
  ('What do you think our biggest strength as a couple is?'),
  ('What''s a place that feels like ''us''?'),
  ('What''s one thing you''ve learned from me?'),
  ('What''s your favorite way to spend a lazy Sunday with me?'),
  ('Which of my habits secretly makes you happy?'),
  ('What''s a goal you want us to reach together?'),
  ('What''s the best gift you could imagine getting from me?'),
  ('What would our perfect home look like?'),
  ('What''s one thing you''d like me to know today?'),
  ('When do you feel most loved by me?'),
  ('What''s your favorite photo of us and why?'),
  ('What''s a movie we have to watch together?'),
  ('What food should we cook together next?'),
  ('What''s a tiny tradition we should start?'),
  ('What made you laugh the hardest with me?'),
  ('What do you love about the way I look at you?'),
  ('How would you describe us in three words?'),
  ('What''s a dream you''ve never told me about?'),
  ('What''s something you''re proud of me for?'),
  ('Which season fits us best and why?'),
  ('What would you write in a letter to us in five years?'),
  ('What''s your favorite text I ever sent you?'),
  ('What''s one thing we should do more often?'),
  ('Where would you take me on a surprise trip?'),
  ('What''s your favorite smell that reminds you of me?'),
  ('What''s a question you''ve always wanted to ask me?'),
  ('What''s the cutest thing I''ve ever said to you?'),
  ('What is one thing that instantly makes your day better?'),
  ('If our love story was a movie, what would it be called?'),
  ('What''s a skill we should learn together?'),
  ('What does a perfect evening with me look like?'),
  ('What are you most grateful for today?'),
  ('What''s your love language, and how can I speak it better?'),
  ('What''s a city you''d love to wake up in with me?'),
  ('Which moment with me would you relive if you could?'),
  ('What''s your favorite outfit of mine?'),
  ('What made today special, even a little?'),
  ('What''s one promise you want to make to me?'),
  ('What do you want to celebrate together next?'),
  ('What''s a song we should dance to someday?'),
  ('What''s the most ''us'' thing we do?'),
  ('What''s a little thing I can do this week to make you happy?'),
  ('What is one compliment you never said out loud?'),
  ('Where do you see us one year from now?'),
  ('What''s your favorite thing to do when we''re on a call?'),
  ('What''s something that always reminds you of our first weeks?'),
  ('What should our couple playlist be called?'),
  ('What do you love most about us right now?')
on conflict (question) do nothing;

-- ===== 20261125000006_studio_clips_status.sql =====
-- ours. — Studio pops, clips feed, "today I'm thinking…" and last activity.

-- ---------------------------------------------------------------------------
-- Profile: status of the day and last activity
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists today_thought     text check (char_length(today_thought) <= 160),
  add column if not exists today_thought_at  timestamptz,
  add column if not exists last_activity     text check (char_length(last_activity) <= 80),
  add column if not exists last_activity_at  timestamptz;

grant update (today_thought, today_thought_at, last_activity, last_activity_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Pops: surprises that play full-screen for the partner on their next visit
-- (jumpscare, video, photo, message). Created in the Studio.
-- ---------------------------------------------------------------------------
create table if not exists public.pops (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('jumpscare', 'video', 'image', 'message')),
  teaser       text check (char_length(teaser) <= 120),
  body         text check (char_length(body) <= 1000),
  media_path   text check (char_length(media_path) <= 300),
  scream       boolean not null default true,
  created_at   timestamptz not null default now(),
  shown_at     timestamptz,
  check (sender_id <> recipient_id),
  check (kind not in ('video', 'image') or media_path is not null)
);
alter table public.pops enable row level security;
create index if not exists pops_recipient_pending on public.pops (recipient_id) where shown_at is null;

create policy "pops: sender and recipient read" on public.pops
  for select to authenticated
  using (public.is_member() and (sender_id = auth.uid() or recipient_id = auth.uid()));

create policy "pops: send to partner only" on public.pops
  for insert to authenticated
  with check (public.is_member() and sender_id = auth.uid() and recipient_id = public.partner_id());

create policy "pops: sender deletes" on public.pops
  for delete to authenticated
  using (sender_id = auth.uid());

revoke update on public.pops from anon, authenticated;

create or replace function public.mark_pop_shown(pop_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.pops set shown_at = now()
  where id = pop_id and recipient_id = auth.uid() and shown_at is null;
$$;
revoke execute on function public.mark_pop_shown(uuid) from public, anon;
grant execute on function public.mark_pop_shown(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Clips: short vertical videos (our own little feed)
-- ---------------------------------------------------------------------------
create table if not exists public.clips (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  video_path  text not null check (char_length(video_path) <= 300),
  caption     text check (char_length(caption) <= 300),
  width       int,
  height      int,
  duration    real,
  created_at  timestamptz not null default now()
);
alter table public.clips enable row level security;
create index if not exists clips_created on public.clips (created_at desc);

create policy "clips: members read" on public.clips
  for select to authenticated using (public.is_member());
create policy "clips: members post own" on public.clips
  for insert to authenticated with check (public.is_member() and author_id = auth.uid());
create policy "clips: author edits" on public.clips
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "clips: author deletes" on public.clips
  for delete to authenticated using (author_id = auth.uid());

create table if not exists public.clip_likes (
  clip_id    uuid not null references public.clips (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, user_id)
);
alter table public.clip_likes enable row level security;
alter table public.clip_likes replica identity full;

create policy "clip likes: members read" on public.clip_likes
  for select to authenticated using (public.is_member());
create policy "clip likes: like as yourself" on public.clip_likes
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy "clip likes: unlike your own" on public.clip_likes
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['pops', 'clips', 'clip_likes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Upload registry: allow the new areas.
alter table public.uploads drop constraint if exists uploads_area_check;
alter table public.uploads add constraint uploads_area_check
  check (area in ('chat', 'memories', 'diary', 'letters', 'surprises', 'avatars', 'backgrounds', 'private', 'clips', 'studio'));

-- ===== 20261125000007_calls.sql =====
-- ours. — call history, missed calls and a server-checked call state machine.
-- Media never touches the server: calls are peer-to-peer WebRTC. This table only
-- records who called whom, when, and how it ended.

create table if not exists public.calls (
  id            uuid primary key,
  caller_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  callee_id     uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('audio', 'video')),
  status        text not null default 'ringing'
                check (status in ('ringing', 'accepted', 'connected', 'declined', 'missed', 'cancelled', 'busy', 'ended', 'failed')),
  end_reason    text check (char_length(end_reason) <= 200),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  connected_at  timestamptz,
  ended_at      timestamptz,
  check (caller_id <> callee_id)
);
alter table public.calls enable row level security;
create index if not exists calls_created on public.calls (created_at desc);

create policy "calls: participants read" on public.calls
  for select to authenticated
  using (public.is_member() and (caller_id = auth.uid() or callee_id = auth.uid()));

create policy "calls: start a call to the partner" on public.calls
  for insert to authenticated
  with check (
    public.is_member()
    and caller_id = auth.uid()
    and callee_id = public.partner_id()
    and status = 'ringing'
    and accepted_at is null and connected_at is null and ended_at is null
  );

create policy "calls: participants delete history" on public.calls
  for delete to authenticated
  using (caller_id = auth.uid() or callee_id = auth.uid());

-- Status only changes through call_set_status(), which enforces the state machine.
revoke update on public.calls from anon, authenticated;

create or replace function public.call_set_status(call_id uuid, next_status text, reason text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  c public.calls;
  me uuid := auth.uid();
  allowed boolean := false;
begin
  select * into c from public.calls where id = call_id for update;
  if not found or me is null or (c.caller_id <> me and c.callee_id <> me) then
    raise exception 'call not found' using errcode = 'P0002';
  end if;

  -- Final states never change again (idempotent for both sides).
  if c.status in ('declined', 'missed', 'cancelled', 'busy', 'ended', 'failed') then
    return c.status;
  end if;

  allowed := case
    when c.status = 'ringing' and next_status in ('accepted', 'declined', 'busy') then me = c.callee_id
    when c.status = 'ringing' and next_status = 'cancelled' then me = c.caller_id
    when c.status = 'ringing' and next_status in ('missed', 'failed') then true
    when c.status = 'accepted' and next_status in ('connected', 'ended', 'failed') then true
    when c.status = 'connected' and next_status in ('ended', 'failed') then true
    else false
  end;

  if not allowed then
    return c.status;
  end if;

  update public.calls set
    status       = next_status,
    end_reason   = coalesce(left(reason, 200), end_reason),
    accepted_at  = case when next_status = 'accepted' then now() else accepted_at end,
    connected_at = case when next_status = 'connected' then coalesce(connected_at, now()) else connected_at end,
    ended_at     = case when next_status in ('declined', 'missed', 'cancelled', 'busy', 'ended', 'failed') then now() else ended_at end
  where id = call_id;
  return next_status;
end;
$$;
revoke execute on function public.call_set_status(uuid, text, text) from public, anon;
grant execute on function public.call_set_status(uuid, text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls'
  ) then
    alter publication supabase_realtime add table public.calls;
  end if;
end $$;

-- ===== 20261125000008_presence_devices.sql =====
-- ours. — presence engine + "our devices".
-- IP-free by design: no IP addresses, no location, no fingerprint. A device is a
-- random id the browser creates for itself; device details are the values the
-- browser reports (shown to the owner, and to the partner only per field).

alter table public.profiles
  add column if not exists share_activity boolean not null default true;
grant update (share_activity) on public.profiles to authenticated;

create table if not exists public.device_sessions (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name              text not null default 'Gerät' check (char_length(name) between 1 and 40),
  device_type       text not null default 'unknown' check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  os                text check (char_length(os) <= 40),
  os_version        text check (char_length(os_version) <= 40),
  browser           text check (char_length(browser) <= 40),
  browser_version   text check (char_length(browser_version) <= 40),
  screen            text check (char_length(screen) <= 40),
  viewport          text check (char_length(viewport) <= 40),
  pwa               boolean,
  app_version       text check (char_length(app_version) <= 40),
  connection        text check (char_length(connection) <= 40),
  battery_level     smallint check (battery_level between 0 and 100),
  battery_charging  boolean,
  share             jsonb not null default
    '{"visible": true, "os": true, "browser": true, "screen": false, "pwa": true, "app": true, "connection": false, "battery": false}'::jsonb,
  created_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at          timestamptz
);
alter table public.device_sessions enable row level security;
create index if not exists device_sessions_user on public.device_sessions (user_id, last_heartbeat_at desc);

-- Owners see and manage their own devices directly. The partner only gets the
-- shared fields through devices_overview().
create policy "devices: owner reads" on public.device_sessions
  for select to authenticated using (user_id = auth.uid());
create policy "devices: owner renames / sets sharing" on public.device_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "devices: owner removes" on public.device_sessions
  for delete to authenticated using (user_id = auth.uid());

revoke insert, update on public.device_sessions from anon, authenticated;
grant update (name, share) on public.device_sessions to authenticated;

-- Heartbeat: registers / refreshes this device with SERVER time.
create or replace function public.device_heartbeat(info jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  did uuid := (info ->> 'id')::uuid;
  d public.device_sessions;
  dtype text := coalesce(info ->> 'device_type', 'unknown');
begin
  if me is null or not public.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select * into d from public.device_sessions where id = did;
  if found and d.user_id <> me then
    raise exception 'device id taken' using errcode = '42501';
  end if;
  if found and d.ended_at is not null then
    return jsonb_build_object('ended', true, 'server_time', now());
  end if;
  if dtype not in ('mobile', 'tablet', 'desktop', 'unknown') then dtype := 'unknown'; end if;

  insert into public.device_sessions as s (
    id, user_id, name, device_type, os, os_version, browser, browser_version, screen, viewport,
    pwa, app_version, connection, battery_level, battery_charging, last_heartbeat_at
  ) values (
    did, me, coalesce(nullif(left(info ->> 'name', 40), ''), 'Gerät'), dtype,
    left(info ->> 'os', 40), left(info ->> 'os_version', 40), left(info ->> 'browser', 40), left(info ->> 'browser_version', 40),
    left(info ->> 'screen', 40), left(info ->> 'viewport', 40), (info ->> 'pwa')::boolean, left(info ->> 'app_version', 40),
    left(info ->> 'connection', 40),
    case when info ? 'battery_level' and info ->> 'battery_level' is not null
         then greatest(0, least(100, (info ->> 'battery_level')::numeric))::smallint end,
    (info ->> 'battery_charging')::boolean, now()
  )
  on conflict (id) do update set
    device_type = excluded.device_type, os = excluded.os, os_version = excluded.os_version,
    browser = excluded.browser, browser_version = excluded.browser_version, screen = excluded.screen,
    viewport = excluded.viewport, pwa = excluded.pwa, app_version = excluded.app_version,
    connection = excluded.connection, battery_level = excluded.battery_level,
    battery_charging = excluded.battery_charging, last_heartbeat_at = now();

  update public.profiles set last_seen_at = now() where id = me and show_online;

  -- Forget devices that have not been used for 90 days.
  delete from public.device_sessions where user_id = me and last_heartbeat_at < now() - interval '90 days';
  return jsonb_build_object('ended', false, 'server_time', now());
end;
$$;
revoke execute on function public.device_heartbeat(jsonb) from public, anon;
grant execute on function public.device_heartbeat(jsonb) to authenticated;

-- End one of MY device sessions: that device signs itself out on its next heartbeat.
create or replace function public.device_end(device_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.device_sessions set ended_at = now()
  where id = device_id and user_id = auth.uid() and ended_at is null;
$$;
revoke execute on function public.device_end(uuid) from public, anon;
grant execute on function public.device_end(uuid) to authenticated;

-- Both people's active devices. Partner devices only show what that person shares.
create or replace function public.devices_overview()
returns table (
  id uuid, user_id uuid, mine boolean, name text, device_type text,
  os text, os_version text, browser text, browser_version text, screen text, viewport text,
  pwa boolean, app_version text, connection text, battery_level smallint, battery_charging boolean,
  share jsonb, created_at timestamptz, last_heartbeat_at timestamptz, online boolean, server_time timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    d.id, d.user_id, d.user_id = auth.uid(), d.name, d.device_type,
    case when d.user_id = auth.uid() or (d.share ->> 'os')::boolean then d.os end,
    case when d.user_id = auth.uid() or (d.share ->> 'os')::boolean then d.os_version end,
    case when d.user_id = auth.uid() or (d.share ->> 'browser')::boolean then d.browser end,
    case when d.user_id = auth.uid() or (d.share ->> 'browser')::boolean then d.browser_version end,
    case when d.user_id = auth.uid() or (d.share ->> 'screen')::boolean then d.screen end,
    case when d.user_id = auth.uid() or (d.share ->> 'screen')::boolean then d.viewport end,
    case when d.user_id = auth.uid() or (d.share ->> 'pwa')::boolean then d.pwa end,
    case when d.user_id = auth.uid() or (d.share ->> 'app')::boolean then d.app_version end,
    case when d.user_id = auth.uid() or (d.share ->> 'connection')::boolean then d.connection end,
    case when d.user_id = auth.uid() or (d.share ->> 'battery')::boolean then d.battery_level end,
    case when d.user_id = auth.uid() or (d.share ->> 'battery')::boolean then d.battery_charging end,
    case when d.user_id = auth.uid() then d.share end,
    d.created_at,
    case when d.user_id = auth.uid() or p.show_online then d.last_heartbeat_at end,
    (d.user_id = auth.uid() or p.show_online) and d.last_heartbeat_at > now() - interval '75 seconds',
    now()
  from public.device_sessions d
  join public.profiles p on p.id = d.user_id
  where public.is_member()
    and d.ended_at is null
    and (d.user_id = auth.uid() or coalesce((d.share ->> 'visible')::boolean, true))
  order by d.user_id = auth.uid() desc, d.last_heartbeat_at desc;
$$;
revoke execute on function public.devices_overview() from public, anon;
grant execute on function public.devices_overview() to authenticated;

-- ===== 20261125000009_push.sql =====
-- ours. — Web Push.
-- The push Edge Function holds the logic; the database only knows which device
-- subscribed, what each person wants to be notified about, and fires a webhook
-- (pg_net) with ids only. VAPID keys are created by the function itself and kept
-- in a table nobody but the service role can read.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Subscriptions: one per device/browser
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  device_id        uuid,
  label            text check (char_length(label) <= 60),
  endpoint         text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh           text not null check (char_length(p256dh) <= 200),
  auth             text not null check (char_length(auth) <= 100),
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  last_error       text check (char_length(last_error) <= 200),
  failures         int not null default 0
);
alter table public.push_subscriptions enable row level security;

create policy "push subs: owner reads" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push subs: owner adds" on public.push_subscriptions
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy "push subs: owner updates" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push subs: owner removes" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
revoke update on public.push_subscriptions from anon, authenticated;
grant update (label, device_id, p256dh, auth) on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- What each of us wants to be notified about
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  categories  jsonb not null default
    '{"chat": true, "call": true, "letter": true, "game": true, "memory": true, "daily_question": true, "events": true, "surprise": true}'::jsonb,
  previews    boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy "notif prefs: owner" on public.notification_prefs
  for all to authenticated using (user_id = auth.uid()) with check (public.is_member() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Server-only config + dedup log (RLS on, no policies => only service role)
-- ---------------------------------------------------------------------------
create table if not exists public.push_config (
  id              int primary key default 1 check (id = 1),
  function_url    text,
  webhook_secret  text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid_public    text,
  vapid_private   text,
  vapid_subject   text
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict do nothing;

create table if not exists public.push_log (
  event_key   text primary key,
  created_at  timestamptz not null default now()
);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

-- Public VAPID key for subscribing (null until the push function ran once).
create or replace function public.push_public_key()
returns text
language sql stable security definer set search_path = ''
as $$
  select vapid_public from public.push_config where id = 1 and public.is_member();
$$;
revoke execute on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

-- ---------------------------------------------------------------------------
-- Webhook: send ids (never content) to the push function
-- ---------------------------------------------------------------------------
create or replace function public.push_dispatch(event_type text, record_id text, actor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.push_config;
begin
  select * into cfg from public.push_config where id = 1;
  if cfg.function_url is null then
    return; -- push not set up yet
  end if;
  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ours-webhook', cfg.webhook_secret),
    body := jsonb_build_object('type', event_type, 'id', record_id, 'actor', actor),
    timeout_milliseconds := 5000
  );
exception when others then
  -- Never let a notification problem break the actual write.
  raise warning 'push_dispatch failed: %', sqlerrm;
end;
$$;
revoke execute on function public.push_dispatch(text, text, uuid) from public, anon, authenticated;

create or replace function public.push_on_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.push_dispatch(tg_argv[0], new.id::text, coalesce(auth.uid(), null));
  return new;
end;
$$;

create or replace function public.push_on_call_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'ringing' then
    perform public.push_dispatch('call', new.id::text, new.caller_id);
  elsif tg_op = 'UPDATE' and old.status = 'ringing' and new.status in ('missed', 'cancelled') then
    perform public.push_dispatch('call_missed', new.id::text, new.caller_id);
  end if;
  return new;
end;
$$;

drop trigger if exists push_messages on public.messages;
create trigger push_messages after insert on public.messages
  for each row execute function public.push_on_insert('chat');
drop trigger if exists push_letters on public.love_letters;
create trigger push_letters after insert on public.love_letters
  for each row execute function public.push_on_insert('letter');
drop trigger if exists push_memories on public.memories;
create trigger push_memories after insert on public.memories
  for each row execute function public.push_on_insert('memory');
drop trigger if exists push_answers on public.question_answers;
create trigger push_answers after insert on public.question_answers
  for each row execute function public.push_on_insert('answer');
drop trigger if exists push_dates on public.date_ideas;
create trigger push_dates after insert on public.date_ideas
  for each row execute function public.push_on_insert('date');
drop trigger if exists push_pops on public.pops;
create trigger push_pops after insert on public.pops
  for each row execute function public.push_on_insert('surprise');
drop trigger if exists push_calls on public.calls;
create trigger push_calls after insert or update of status on public.calls
  for each row execute function public.push_on_call_change();

-- Daily question reminder at 10:00 Berlin time (pg_cron runs in UTC, so check every hour).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'ours-daily-question';
    perform cron.schedule(
      'ours-daily-question',
      '0 * * * *',
      $cron$
        select public.push_dispatch('daily_question', public.berlin_today()::text, null)
        where extract(hour from (now() at time zone 'Europe/Berlin')) = 10;
      $cron$
    );
  end if;
end $$;

-- Register this browser's subscription for me. A browser endpoint belongs to whoever
-- is signed in on that browser now, so an older registration of it is replaced.
create or replace function public.push_register(sub_endpoint text, sub_p256dh text, sub_auth text, sub_device uuid, sub_label text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if sub_endpoint !~ '^https://' or char_length(sub_endpoint) > 1000 then
    raise exception 'invalid endpoint';
  end if;
  delete from public.push_subscriptions where endpoint = sub_endpoint and user_id <> auth.uid();
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_id, label)
  values (auth.uid(), sub_endpoint, left(sub_p256dh, 200), left(sub_auth, 100), sub_device, left(sub_label, 60))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    device_id = excluded.device_id, label = excluded.label, failures = 0, last_error = null
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.push_register(text, text, text, uuid, text) from public, anon;
grant execute on function public.push_register(text, text, text, uuid, text) to authenticated;

-- ===== 20261125000010_activity.sql =====
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

-- ===== 20261125000011_integrations.sql =====
-- ours. — integrations (Spotify, Google Calendar, …).
-- Only the server (Next.js route handlers) talks to provider APIs. OAuth tokens are
-- encrypted on the server with INTEGRATIONS_ENCRYPTION_KEY (AES-256-GCM) before
-- they reach the database; the database only ever holds ciphertext, and only its
-- owner can read that ciphertext back (useless without the server key).

create table if not exists public.integration_connections (
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  provider       text not null check (provider in ('spotify', 'google_calendar')),
  account_label  text check (char_length(account_label) <= 120),
  scopes         text[] not null default '{}',
  status         text not null default 'connected' check (status in ('connected', 'error', 'expired')),
  last_error     text check (char_length(last_error) <= 300),
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.integration_connections enable row level security;
create policy "integrations: members see who connected what" on public.integration_connections
  for select to authenticated using (public.is_member());
create policy "integrations: owner disconnects" on public.integration_connections
  for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.integration_connections from anon, authenticated;

create table if not exists public.integration_tokens (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  provider    text not null,
  ciphertext  text not null check (char_length(ciphertext) <= 8000),
  expires_at  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, provider),
  foreign key (user_id, provider) references public.integration_connections (user_id, provider) on delete cascade
);
alter table public.integration_tokens enable row level security;
revoke all on public.integration_tokens from anon, authenticated;

-- Called by the server after a successful OAuth exchange (with the user's own session).
create or replace function public.integration_save(p_provider text, p_label text, p_scopes text[], p_ciphertext text, p_expires_at timestamptz)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  insert into public.integration_connections (user_id, provider, account_label, scopes, status, last_error, connected_at, updated_at)
  values (auth.uid(), p_provider, left(p_label, 120), coalesce(p_scopes, '{}'), 'connected', null, now(), now())
  on conflict (user_id, provider) do update set
    account_label = excluded.account_label, scopes = excluded.scopes, status = 'connected', last_error = null, updated_at = now();
  insert into public.integration_tokens (user_id, provider, ciphertext, expires_at, updated_at)
  values (auth.uid(), p_provider, p_ciphertext, p_expires_at, now())
  on conflict (user_id, provider) do update set ciphertext = excluded.ciphertext, expires_at = excluded.expires_at, updated_at = now();
end;
$$;
revoke execute on function public.integration_save(text, text, text[], text, timestamptz) from public, anon;
grant execute on function public.integration_save(text, text, text[], text, timestamptz) to authenticated;

create or replace function public.integration_token(p_provider text)
returns table (ciphertext text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select t.ciphertext, t.expires_at from public.integration_tokens t
  where t.user_id = auth.uid() and t.provider = p_provider and public.is_member();
$$;
revoke execute on function public.integration_token(text) from public, anon;
grant execute on function public.integration_token(text) to authenticated;

create or replace function public.integration_mark(p_provider text, p_status text, p_error text)
returns void
language sql security definer set search_path = ''
as $$
  update public.integration_connections
  set status = case when p_status in ('connected', 'error', 'expired') then p_status else status end,
      last_error = left(p_error, 300), updated_at = now()
  where user_id = auth.uid() and provider = p_provider;
$$;
revoke execute on function public.integration_mark(text, text, text) from public, anon;
grant execute on function public.integration_mark(text, text, text) to authenticated;

-- ===== 20261125000012_play_together.sql =====
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

-- ===== 20261125000013_game_content.sql =====
-- ours. — prompts for the Play Together party games. Generic questions and ideas,
-- nothing about the two of you is made up. Re-running this adds nothing twice.

create or replace function pg_temp.seed(content_kind text, items jsonb)
returns void
language sql
as $$
  insert into public.game_content (kind, body)
  select content_kind, x from jsonb_array_elements(items) x
  where not exists (select 1 from public.game_content c where c.kind = content_kind and c.body = x);
$$;

select pg_temp.seed('quiz', $j$[
  {"q": "Mein perfekter Sonntag?", "options": ["Ausschlafen und Brunch", "Raus in die Natur", "Serien-Marathon", "Stadt, Café, Bummeln"]},
  {"q": "Wenn ich nur noch eins essen dürfte…", "options": ["Pizza", "Sushi", "Pasta", "Burger"]},
  {"q": "Welche Superkraft hätte ich am liebsten?", "options": ["Teleportieren", "Gedanken lesen", "Zeit anhalten", "Fliegen"]},
  {"q": "Meine Traumreise?", "options": ["Strand und Meer", "Großstadt", "Berge und Hütte", "Roadtrip"]},
  {"q": "Morgens bin ich…", "options": ["sofort wach", "erst nach Kaffee ein Mensch", "Snooze-Profi", "kommt drauf an"]},
  {"q": "Wenn ich traurig bin, hilft mir am meisten…", "options": ["eine Umarmung", "Essen", "Musik", "Ablenkung und Lachen"]},
  {"q": "Mein Lieblings-Filmgenre?", "options": ["Romcom", "Horror", "Action", "Drama"]},
  {"q": "Das schönste Geschenk für mich wäre…", "options": ["etwas Selbstgemachtes", "ein gemeinsames Erlebnis", "Blumen und ein Brief", "etwas, das ich mir gewünscht habe"]},
  {"q": "Meine Lieblings-Jahreszeit?", "options": ["Frühling", "Sommer", "Herbst", "Winter"]},
  {"q": "Ich fühle mich am meisten geliebt durch…", "options": ["Worte", "Zeit zusammen", "Berührung", "kleine Aufmerksamkeiten"]},
  {"q": "Was nervt mich am meisten?", "options": ["Unpünktlichkeit", "Lautes Kauen", "Langsames WLAN", "Wenn jemand spoilert"]},
  {"q": "Auf einer Party bin ich…", "options": ["auf der Tanzfläche", "in der Küche am Quatschen", "beim Essen", "die erste, die gehen will"]},
  {"q": "Mein Go-to-Getränk?", "options": ["Kaffee", "Tee", "Matcha", "Softdrink"]},
  {"q": "Womit kann man mich am schnellsten bestechen?", "options": ["Schokolade", "Pommes", "Kuscheln", "Ausschlafen lassen"]},
  {"q": "Wenn ich im Lotto gewinne, kaufe ich zuerst…", "options": ["eine Reise", "ein Haus", "ein Auto", "ich spare alles"]},
  {"q": "Mein geheimes Talent wäre gern…", "options": ["Singen", "Tanzen", "Kochen wie ein Profi", "Zeichnen"]},
  {"q": "Bei einem Streit brauche ich…", "options": ["sofort reden", "erst kurz Ruhe", "eine Umarmung", "Essen"]},
  {"q": "Mein Lieblingsort zum Entspannen?", "options": ["Bett", "Badewanne", "Sofa", "draußen"]},
  {"q": "Welche Tageszeit mag ich am liebsten?", "options": ["früher Morgen", "Mittag", "Abend", "mitten in der Nacht"]},
  {"q": "Mein Handy-Akku ist meistens…", "options": ["voll", "halb", "unter 20 %", "gerade leer"]}
]$j$::jsonb);

select pg_temp.seed('thisorthat', $j$[
  {"a": "Kaffee", "b": "Tee"}, {"a": "Strand", "b": "Berge"}, {"a": "Netflix", "b": "Ausgehen"},
  {"a": "Frühaufsteher", "b": "Nachteule"}, {"a": "Pizza", "b": "Sushi"}, {"a": "Sommer", "b": "Winter"},
  {"a": "Katze", "b": "Hund"}, {"a": "Schreiben", "b": "Anrufen"}, {"a": "Süß", "b": "Salzig"},
  {"a": "Stadt", "b": "Land"}, {"a": "Romcom", "b": "Thriller"}, {"a": "Sonnenaufgang", "b": "Sonnenuntergang"},
  {"a": "Kochen", "b": "Bestellen"}, {"a": "Planen", "b": "Spontan"}, {"a": "Bücher", "b": "Serien"},
  {"a": "Duschen morgens", "b": "Duschen abends"}, {"a": "Kuscheln", "b": "Platz im Bett"}, {"a": "Regen", "b": "Schnee"},
  {"a": "Konzert", "b": "Kino"}, {"a": "Pommes", "b": "Chips"}, {"a": "Schokolade", "b": "Gummibärchen"},
  {"a": "Fotos machen", "b": "Im Moment sein"}, {"a": "Fliegen", "b": "Zug fahren"}, {"a": "Hotel", "b": "Zelt"},
  {"a": "Erst Dessert", "b": "Erst Hauptgang"}, {"a": "Tanzen", "b": "Singen"}, {"a": "Laut", "b": "Leise"},
  {"a": "Altes Lieblingslied", "b": "Neue Entdeckung"}, {"a": "Frühstück", "b": "Abendessen"}, {"a": "Brettspiel", "b": "Videospiel"}
]$j$::jsonb);

select pg_temp.seed('guess', $j$[
  {"q": "Welches Essen könnte ich jeden Tag essen?"},
  {"q": "Was würde ich als Erstes tun, wenn ich unsichtbar wäre?"},
  {"q": "Welcher Song läuft gerade in meinem Kopf?"},
  {"q": "Was ist mein liebstes Geräusch?"},
  {"q": "Wohin würde ich morgen spontan reisen?"},
  {"q": "Welches Emoji benutze ich am häufigsten?"},
  {"q": "Was war mein Lieblingsspielzeug als Kind?"},
  {"q": "Welcher Film bringt mich immer zum Lachen?"},
  {"q": "Was würde ich auf eine einsame Insel mitnehmen?"},
  {"q": "Was ist meine liebste Pizza-Sorte?"},
  {"q": "Welches Tier wäre ich?"},
  {"q": "Was ist mein schlimmster Ohrwurm?"},
  {"q": "Was würde ich mit einem freien Tag ganz allein machen?"},
  {"q": "Was ist mein Lieblingsgeruch?"},
  {"q": "Welche Farbe hätte mein Traumauto?"},
  {"q": "Welche Serie würde ich sofort nochmal schauen?"},
  {"q": "Was bestelle ich im Café immer?"},
  {"q": "Was ist das Erste, das ich morgens mache?"},
  {"q": "Welcher Promi wäre mein bester Freund?"},
  {"q": "Was ist mein liebstes Wort?"}
]$j$::jsonb);

select pg_temp.seed('truth', $j$[
  {"text": "Was war dein erster Gedanke, als du mich zum ersten Mal gesehen hast?"},
  {"text": "Was ist eine Kleinigkeit an mir, die du heimlich total süß findest?"},
  {"text": "Wann hast du zuletzt an mich gedacht und warum?"},
  {"text": "Was ist dein peinlichster Moment aus der Schulzeit?"},
  {"text": "Was würdest du an unserem perfekten Tag zusammen machen?"},
  {"text": "Welche Angewohnheit von dir würdest du gern loswerden?"},
  {"text": "Was ist ein Traum, den du noch niemandem erzählt hast?"},
  {"text": "Wovor hattest du als Kind am meisten Angst?"},
  {"text": "Was ist die verrückteste Sache, die du je gemacht hast?"},
  {"text": "Welches Lied erinnert dich an mich?"},
  {"text": "Was hast du zuletzt gegoogelt?"},
  {"text": "Was war dein schönster Moment in diesem Jahr?"},
  {"text": "Was möchtest du unbedingt einmal mit mir erleben?"},
  {"text": "Welche Eigenschaft bewunderst du an mir am meisten?"},
  {"text": "Wann hast du zuletzt geweint und warum?"},
  {"text": "Was ist dein Guilty Pleasure?"},
  {"text": "Welches Kompliment hat dir am meisten bedeutet?"},
  {"text": "Was würdest du tun, wenn du einen Tag lang ich wärst?"},
  {"text": "Was ist deine liebste Erinnerung aus deiner Kindheit?"},
  {"text": "Worüber machst du dir gerade die meisten Gedanken?"},
  {"text": "Was ist dir wichtig in einer Beziehung, das du nie laut sagst?"},
  {"text": "Welche App öffnest du am häufigsten?"},
  {"text": "Was war die beste Entscheidung deines Lebens?"},
  {"text": "Wofür bist du heute dankbar?"},
  {"text": "Was ist ein Geheimtalent, das ich noch nicht kenne?"}
]$j$::jsonb);

select pg_temp.seed('dare', $j$[
  {"text": "Schick ein Selfie mit deiner lustigsten Grimasse."},
  {"text": "Sing die erste Zeile deines Lieblingsliedes als Sprachnachricht."},
  {"text": "Schreib mir ein Gedicht mit vier Zeilen, jetzt sofort."},
  {"text": "Mach 10 Hampelmänner und zähl laut mit."},
  {"text": "Beschreib mich in drei Emojis."},
  {"text": "Erzähl einen Witz. Wenn ich nicht lache, noch einen."},
  {"text": "Imitier mich, wie ich morgens aufwache."},
  {"text": "Zeig mir das letzte Foto in deiner Galerie."},
  {"text": "Sag mir drei Dinge, die du an mir liebst, ohne zu zögern."},
  {"text": "Sprich die nächste Minute nur mit Akzent."},
  {"text": "Mach ein Foto von etwas in deiner Nähe, das dich an mich erinnert."},
  {"text": "Tanz 15 Sekunden zu einem Lied, das ich aussuche."},
  {"text": "Schreib mir eine Liebeserklärung nur mit Wörtern, die mit dem gleichen Buchstaben anfangen."},
  {"text": "Zeichne mich in 30 Sekunden und schick das Bild."},
  {"text": "Erzähl mir von deinem Tag wie ein Nachrichtensprecher."},
  {"text": "Mach ein Kompliment, das du noch nie jemandem gemacht hast."},
  {"text": "Stell dein Handy für die nächste Stunde auf meinen Lieblingssong als Klingelton."},
  {"text": "Schick mir eine Sprachnachricht, in der du flüsterst, was du heute Abend vorhast."},
  {"text": "Mach eine Pose wie auf einem Filmplakat und schick ein Foto."},
  {"text": "Plane in 60 Sekunden unser nächstes Date und erzähl es mir."},
  {"text": "Lies mir die letzte Nachricht vor, die du jemand anderem geschickt hast (wenn es okay ist)."},
  {"text": "Erfinde einen Spitznamen für mich und benutze ihn den Rest des Spiels."},
  {"text": "Mach 20 Sekunden lang einen Tierlaut deiner Wahl."},
  {"text": "Schreib mir, was du an unserem ersten Date anders machen würdest."},
  {"text": "Erzähl mir eine kleine Gute-Nacht-Geschichte in drei Sätzen."}
]$j$::jsonb);

select pg_temp.seed('date', $j$[
  {"text": "Kocht zusammen ein Gericht aus einem Land, in dem ihr noch nie wart."},
  {"text": "Macht einen Fotowalk: jeder fotografiert zehn Dinge, die ihn an den anderen erinnern."},
  {"text": "Picknick an einem Ort, an dem ihr noch nie zusammen wart."},
  {"text": "Filmabend, aber jeder sucht den Film für den anderen aus, ohne ihn vorher zu verraten."},
  {"text": "Baut eine Deckenburg und verbringt den Abend darin."},
  {"text": "Geht in ein Museum und erfindet zu jedem Bild eine eigene Geschichte."},
  {"text": "Sternegucken mit Decke und heißem Kakao."},
  {"text": "Ein Abend ohne Handys: Brettspiele, Kerzen, Musik."},
  {"text": "Erstellt zusammen eine Playlist mit 20 Songs, die eure Geschichte erzählen."},
  {"text": "Frühstück im Bett, für einander zubereitet."},
  {"text": "Karaoke-Abend, zu Hause oder in einer Bar."},
  {"text": "Lauft eine Route, die ihr vorher auf der Karte als Herz gezeichnet habt."},
  {"text": "Flohmarkt-Challenge: jeder kauft für 5 € ein Geschenk für den anderen."},
  {"text": "Schreibt euch gegenseitig einen Brief und lest ihn euch beim Abendessen vor."},
  {"text": "Probiert zusammen etwas aus, was keiner von euch kann: Töpfern, Tanzen, Klettern."},
  {"text": "Sonnenaufgang anschauen, mit Kaffee aus der Thermoskanne."},
  {"text": "Ein Tag als Touristen in eurer eigenen Stadt."},
  {"text": "Backt etwas zusammen, und jeder darf eine geheime Zutat hinzufügen."},
  {"text": "Videocall-Date: gleiche Mahlzeit bestellen, gleichen Film starten."},
  {"text": "Eis-Tour: probiert drei Eisdielen und kürt einen Sieger."},
  {"text": "Spaziergang ohne Ziel, und an jeder Kreuzung entscheidet ein Münzwurf."},
  {"text": "Plant euren Traumurlaub in allen Details, als würdet ihr morgen fliegen."},
  {"text": "Minigolf oder Bowling mit einer kleinen Wette um den nächsten Abwasch."},
  {"text": "Macht ein Mini-Fotoshooting im Partnerlook."},
  {"text": "Lest euch gegenseitig ein Kapitel aus eurem Lieblingsbuch vor."}
]$j$::jsonb);

-- ===== 20261125000014_listen_together.sql =====
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
