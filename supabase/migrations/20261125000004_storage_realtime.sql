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
