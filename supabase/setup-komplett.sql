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
