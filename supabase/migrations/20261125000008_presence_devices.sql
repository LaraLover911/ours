-- ours. — presence engine + "our devices".
-- IP-free by design: no IP addresses, no location, no fingerprint. A device is a
-- random id the browser creates for itself; device details are the values the
-- browser reports (shown to the owner, and to the partner only per field).

alter table public.profiles
  add column if not exists share_activity boolean not null default true;
grant update (share_activity) on public.profiles to authenticated;

create table if not exists public.device_sessions (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name              text not null default 'Gerät' check (char_length(name) between 1 and 40),
  device_type       text not null default 'unknown' check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  os                text check (char_length(os) <= 40),
  os_version        text check (char_length(os_version) <= 40),
  browser           text check (char_length(browser) <= 40),
  browser_version   text check (char_length(browser_version) <= 40),
  screen            text check (char_length(screen) <= 40),
  viewport          text check (char_length(viewport) <= 40),
  pwa               boolean,
  app_version       text check (char_length(app_version) <= 40),
  connection        text check (char_length(connection) <= 40),
  battery_level     smallint check (battery_level between 0 and 100),
  battery_charging  boolean,
  share             jsonb not null default
    '{"visible": true, "os": true, "browser": true, "screen": false, "pwa": true, "app": true, "connection": false, "battery": false}'::jsonb,
  created_at        timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at          timestamptz
);
alter table public.device_sessions enable row level security;
create index if not exists device_sessions_user on public.device_sessions (user_id, last_heartbeat_at desc);

-- Owners see and manage their own devices directly. The partner only gets the
-- shared fields through devices_overview().
create policy "devices: owner reads" on public.device_sessions
  for select to authenticated using (user_id = auth.uid());
create policy "devices: owner renames / sets sharing" on public.device_sessions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "devices: owner removes" on public.device_sessions
  for delete to authenticated using (user_id = auth.uid());

revoke insert, update on public.device_sessions from anon, authenticated;
grant update (name, share) on public.device_sessions to authenticated;

-- Heartbeat: registers / refreshes this device with SERVER time.
create or replace function public.device_heartbeat(info jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  did uuid := (info ->> 'id')::uuid;
  d public.device_sessions;
  dtype text := coalesce(info ->> 'device_type', 'unknown');
begin
  if me is null or not public.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  select * into d from public.device_sessions where id = did;
  if found and d.user_id <> me then
    raise exception 'device id taken' using errcode = '42501';
  end if;
  if found and d.ended_at is not null then
    return jsonb_build_object('ended', true, 'server_time', now());
  end if;
  if dtype not in ('mobile', 'tablet', 'desktop', 'unknown') then dtype := 'unknown'; end if;

  insert into public.device_sessions as s (
    id, user_id, name, device_type, os, os_version, browser, browser_version, screen, viewport,
    pwa, app_version, connection, battery_level, battery_charging, last_heartbeat_at
  ) values (
    did, me, coalesce(nullif(left(info ->> 'name', 40), ''), 'Gerät'), dtype,
    left(info ->> 'os', 40), left(info ->> 'os_version', 40), left(info ->> 'browser', 40), left(info ->> 'browser_version', 40),
    left(info ->> 'screen', 40), left(info ->> 'viewport', 40), (info ->> 'pwa')::boolean, left(info ->> 'app_version', 40),
    left(info ->> 'connection', 40),
    case when info ? 'battery_level' and info ->> 'battery_level' is not null
         then greatest(0, least(100, (info ->> 'battery_level')::numeric))::smallint end,
    (info ->> 'battery_charging')::boolean, now()
  )
  on conflict (id) do update set
    device_type = excluded.device_type, os = excluded.os, os_version = excluded.os_version,
    browser = excluded.browser, browser_version = excluded.browser_version, screen = excluded.screen,
    viewport = excluded.viewport, pwa = excluded.pwa, app_version = excluded.app_version,
    connection = excluded.connection, battery_level = excluded.battery_level,
    battery_charging = excluded.battery_charging, last_heartbeat_at = now();

  update public.profiles set last_seen_at = now() where id = me and show_online;

  -- Forget devices that have not been used for 90 days.
  delete from public.device_sessions where user_id = me and last_heartbeat_at < now() - interval '90 days';
  return jsonb_build_object('ended', false, 'server_time', now());
end;
$$;
revoke execute on function public.device_heartbeat(jsonb) from public, anon;
grant execute on function public.device_heartbeat(jsonb) to authenticated;

-- End one of MY device sessions: that device signs itself out on its next heartbeat.
create or replace function public.device_end(device_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.device_sessions set ended_at = now()
  where id = device_id and user_id = auth.uid() and ended_at is null;
$$;
revoke execute on function public.device_end(uuid) from public, anon;
grant execute on function public.device_end(uuid) to authenticated;

-- Both people's active devices. Partner devices only show what that person shares.
create or replace function public.devices_overview()
returns table (
  id uuid, user_id uuid, mine boolean, name text, device_type text,
  os text, os_version text, browser text, browser_version text, screen text, viewport text,
  pwa boolean, app_version text, connection text, battery_level smallint, battery_charging boolean,
  share jsonb, created_at timestamptz, last_heartbeat_at timestamptz, online boolean, server_time timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    d.id, d.user_id, d.user_id = auth.uid(), d.name, d.device_type,
    case when d.user_id = auth.uid() or (d.share ->> 'os')::boolean then d.os end,
    case when d.user_id = auth.uid() or (d.share ->> 'os')::boolean then d.os_version end,
    case when d.user_id = auth.uid() or (d.share ->> 'browser')::boolean then d.browser end,
    case when d.user_id = auth.uid() or (d.share ->> 'browser')::boolean then d.browser_version end,
    case when d.user_id = auth.uid() or (d.share ->> 'screen')::boolean then d.screen end,
    case when d.user_id = auth.uid() or (d.share ->> 'screen')::boolean then d.viewport end,
    case when d.user_id = auth.uid() or (d.share ->> 'pwa')::boolean then d.pwa end,
    case when d.user_id = auth.uid() or (d.share ->> 'app')::boolean then d.app_version end,
    case when d.user_id = auth.uid() or (d.share ->> 'connection')::boolean then d.connection end,
    case when d.user_id = auth.uid() or (d.share ->> 'battery')::boolean then d.battery_level end,
    case when d.user_id = auth.uid() or (d.share ->> 'battery')::boolean then d.battery_charging end,
    case when d.user_id = auth.uid() then d.share end,
    d.created_at,
    case when d.user_id = auth.uid() or p.show_online then d.last_heartbeat_at end,
    (d.user_id = auth.uid() or p.show_online) and d.last_heartbeat_at > now() - interval '75 seconds',
    now()
  from public.device_sessions d
  join public.profiles p on p.id = d.user_id
  where public.is_member()
    and d.ended_at is null
    and (d.user_id = auth.uid() or coalesce((d.share ->> 'visible')::boolean, true))
  order by d.user_id = auth.uid() desc, d.last_heartbeat_at desc;
$$;
revoke execute on function public.devices_overview() from public, anon;
grant execute on function public.devices_overview() to authenticated;
