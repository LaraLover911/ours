-- ours. — security hardening after the audit.
--
-- 1. Storage: media that is sealed until a date or a condition must not be
--    readable (or listable) through the storage API before that. Until now
--    every member could read every non-private folder, so a partner could
--    list "<uid>/capsule/" or "<uid>/photo/" and open a time capsule or the
--    photo of the day early. The rule now mirrors the table policies:
--      capsule   → only once the capsule's open_at has passed
--      photo     → past days, or after you posted that day yourself
--      letters   → once the letter is open for you
--      surprises → once the surprise is revealed to you
--      studio    → only the recipient of the pop
--      private   → owner only (unchanged)
--    The owner can always read their own files.
-- 2. Table privileges: anon/authenticated never need TRUNCATE, TRIGGER or
--    REFERENCES (TRUNCATE would bypass RLS if it were ever reachable).
-- 3. Trigger functions are not callable by clients anyway; revoke for clarity.

create or replace function public.media_readable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_member() and (
    split_part(p_name, '/', 1) = auth.uid()::text
    or case split_part(p_name, '/', 2)
      when 'private' then false
      when 'capsule' then exists (
        select 1 from public.time_capsule_contents cc
        join public.time_capsules c on c.id = cc.capsule_id
        where p_name = any (cc.media_paths) and c.open_at <= now())
      when 'photo' then exists (
        select 1 from public.daily_photos p
        where p.path = p_name and (p.day < public.berlin_today() or public.posted_photo_on(p.day)))
      when 'letters' then exists (
        select 1 from public.love_letters l
        where l.image_path = p_name
          and (l.recipient_id = auth.uid() or l.recipient_id is null)
          and (l.open_at is null or l.open_at <= now()))
      when 'surprises' then exists (
        select 1 from public.surprises s
        where s.image_path = p_name and s.recipient_id = auth.uid() and s.reveal_at <= now())
      when 'studio' then exists (
        select 1 from public.pops o where o.media_path = p_name and o.recipient_id = auth.uid())
      else true
    end
  );
$$;
revoke execute on function public.media_readable(text) from public, anon;
grant execute on function public.media_readable(text) to authenticated;

drop policy if exists "ours: members read shared media, owners read private media" on storage.objects;
drop policy if exists "ours: members read media they may see" on storage.objects;
create policy "ours: members read media they may see"
  on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.media_readable(name));

-- The uploads index must not reveal sealed paths either.
drop policy if exists "members read shared uploads, owners read private" on public.uploads;
drop policy if exists "uploads: owner or readable media" on public.uploads;
create policy "uploads: owner or readable media" on public.uploads
  for select to authenticated using (owner_id = auth.uid() or public.media_readable(path));

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 4. Moodboard web images only from the search providers the app uses
--    (no arbitrary third-party hosts that could track who looks at the board),
--    and credit links must be https.
alter table public.moodboard_items drop constraint if exists moodboard_items_web_host;
alter table public.moodboard_items add constraint moodboard_items_web_host check (
  url is null or url ~ '^https://(images\.unsplash\.com|plus\.unsplash\.com|media[0-9]*\.giphy\.com|i\.giphy\.com|media\.tenor\.com)/'
);
alter table public.moodboard_items drop constraint if exists moodboard_items_credit_url;
alter table public.moodboard_items add constraint moodboard_items_credit_url check (
  credit is null or credit ->> 'url' is null or credit ->> 'url' ~ '^https://'
);
