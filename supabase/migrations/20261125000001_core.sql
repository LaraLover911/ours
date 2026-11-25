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
