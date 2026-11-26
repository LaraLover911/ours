-- ours. — more integrations: Discord webhooks (stored encrypted like OAuth tokens)
-- and a weather place per person (typed by the person, never from the browser's
-- geolocation and never derived from an IP address).

alter table public.integration_connections drop constraint if exists integration_connections_provider_check;
alter table public.integration_connections add constraint integration_connections_provider_check
  check (provider in ('spotify', 'google_calendar', 'discord'));

create table if not exists public.weather_places (
  user_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  country     text check (char_length(country) <= 80),
  lat         numeric not null check (lat between -90 and 90),
  lon         numeric not null check (lon between -180 and 180),
  timezone    text check (char_length(timezone) <= 60),
  updated_at  timestamptz not null default now()
);
alter table public.weather_places enable row level security;
drop policy if exists "weather: members read" on public.weather_places;
create policy "weather: members read" on public.weather_places for select to authenticated using (public.is_member());
drop policy if exists "weather: owner writes" on public.weather_places;
create policy "weather: owner writes" on public.weather_places for insert to authenticated with check (user_id = auth.uid() and public.is_member());
drop policy if exists "weather: owner updates" on public.weather_places;
create policy "weather: owner updates" on public.weather_places for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "weather: owner deletes" on public.weather_places;
create policy "weather: owner deletes" on public.weather_places for delete to authenticated using (user_id = auth.uid());
revoke all on public.weather_places from anon;
