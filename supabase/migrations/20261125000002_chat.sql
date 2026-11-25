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
