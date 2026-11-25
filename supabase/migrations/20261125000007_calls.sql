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
