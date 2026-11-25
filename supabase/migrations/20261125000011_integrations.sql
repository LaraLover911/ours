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
