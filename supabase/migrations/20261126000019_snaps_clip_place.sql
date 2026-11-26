-- ours. — snaps in the chat, and when/where a clip was filmed.
--
-- 1. Clips get the recording time and a place name read from the video's own
--    metadata on the author's device. Only a human-readable place the author
--    chose to keep is stored, never coordinates.
-- 2. Snaps: a photo or video message that the recipient can open once.
--    * stored under "<sender>/snaps/…", only as kind 'snap'
--    * the recipient can read the file only for 10 minutes after opening
--      (opening is recorded by open_snap(), never by a plain update)
--    * afterwards the recipient may delete the file; the sender always can

-- 1. Clips --------------------------------------------------------------------
alter table public.clips add column if not exists recorded_at timestamptz;
alter table public.clips add column if not exists place text;
alter table public.clips drop constraint if exists clips_place_check;
alter table public.clips add constraint clips_place_check check (place is null or char_length(btrim(place)) between 1 and 120);

-- 2. Snaps --------------------------------------------------------------------
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'image', 'video', 'audio', 'snap'));
alter table public.messages add column if not exists opened_at timestamptz;

alter table public.uploads drop constraint if exists uploads_area_check;
alter table public.uploads add constraint uploads_area_check
  check (area in ('chat', 'memories', 'diary', 'letters', 'surprises', 'avatars', 'backgrounds', 'private', 'clips', 'studio', 'voice', 'capsule', 'photo', 'moodboard', 'snaps'));

create or replace function public.messages_snap_insert()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.opened_at = null;
  if new.kind = 'snap' then
    if new.attachment_path is null or split_part(new.attachment_path, '/', 2) <> 'snaps' then
      raise exception 'Ein Snap braucht ein Foto oder Video';
    end if;
    if coalesce(new.attachment_meta ->> 'media', '') not in ('image', 'video') then
      raise exception 'Ein Snap ist ein Foto oder ein Video';
    end if;
    new.reply_to_id = null;
  elsif new.attachment_path is not null and split_part(new.attachment_path, '/', 2) = 'snaps' then
    raise exception 'Snap-Dateien gehören nur in Snaps';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_snap_insert on public.messages;
create trigger messages_snap_insert before insert on public.messages
  for each row execute function public.messages_snap_insert();

-- Snap captions cannot be edited (deleting a snap is still allowed).
create or replace function public.messages_snap_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.kind = 'snap' and new.deleted_at is null and new.body is distinct from old.body then
    raise exception 'Snaps können nicht bearbeitet werden';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_snap_guard on public.messages;
create trigger messages_snap_guard before update on public.messages
  for each row execute function public.messages_snap_guard();

revoke execute on function public.messages_snap_insert() from public, anon, authenticated;
revoke execute on function public.messages_snap_guard() from public, anon, authenticated;

-- The recipient opens a snap (once). Returns when it was opened.
create or replace function public.open_snap(p_id uuid)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v public.messages;
begin
  if not public.is_member() then
    raise exception 'Nicht erlaubt';
  end if;
  select * into v from public.messages where id = p_id for update;
  if v.id is null or v.kind <> 'snap' or v.deleted_at is not null then
    raise exception 'Diesen Snap gibt es nicht mehr';
  end if;
  if v.sender_id = auth.uid() then
    raise exception 'Deinen eigenen Snap kannst du nicht öffnen';
  end if;
  if v.opened_at is null then
    update public.messages set opened_at = now() where id = p_id returning opened_at into v.opened_at;
  end if;
  return v.opened_at;
end;
$$;
revoke execute on function public.open_snap(uuid) from public, anon;
grant execute on function public.open_snap(uuid) to authenticated;

-- Storage: who may read which file (adds the snaps case to migration 18).
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
      when 'snaps' then exists (
        select 1 from public.messages m
        where m.attachment_path = p_name and m.kind = 'snap' and m.deleted_at is null
          and m.sender_id <> auth.uid()
          and m.opened_at is not null and m.opened_at > now() - interval '10 minutes')
      else true
    end
  );
$$;
revoke execute on function public.media_readable(text) from public, anon;
grant execute on function public.media_readable(text) to authenticated;

-- After watching, the recipient removes the snap file.
create or replace function public.snap_deletable(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_member() and split_part(p_name, '/', 2) = 'snaps' and exists (
    select 1 from public.messages m
    where m.attachment_path = p_name and m.kind = 'snap'
      and m.sender_id <> auth.uid() and m.opened_at is not null);
$$;
revoke execute on function public.snap_deletable(text) from public, anon;
grant execute on function public.snap_deletable(text) to authenticated;

drop policy if exists "ours: recipients delete opened snaps" on storage.objects;
create policy "ours: recipients delete opened snaps"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.snap_deletable(name));
