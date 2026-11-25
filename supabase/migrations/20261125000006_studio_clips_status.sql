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
