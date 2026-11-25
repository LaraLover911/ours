-- ours. — Web Push.
-- The push Edge Function holds the logic; the database only knows which device
-- subscribed, what each person wants to be notified about, and fires a webhook
-- (pg_net) with ids only. VAPID keys are created by the function itself and kept
-- in a table nobody but the service role can read.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Subscriptions: one per device/browser
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  device_id        uuid,
  label            text check (char_length(label) <= 60),
  endpoint         text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh           text not null check (char_length(p256dh) <= 200),
  auth             text not null check (char_length(auth) <= 100),
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  last_error       text check (char_length(last_error) <= 200),
  failures         int not null default 0
);
alter table public.push_subscriptions enable row level security;

create policy "push subs: owner reads" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push subs: owner adds" on public.push_subscriptions
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy "push subs: owner updates" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push subs: owner removes" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
revoke update on public.push_subscriptions from anon, authenticated;
grant update (label, device_id, p256dh, auth) on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- What each of us wants to be notified about
-- ---------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  user_id     uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  categories  jsonb not null default
    '{"chat": true, "call": true, "letter": true, "game": true, "memory": true, "daily_question": true, "events": true, "surprise": true}'::jsonb,
  previews    boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy "notif prefs: owner" on public.notification_prefs
  for all to authenticated using (user_id = auth.uid()) with check (public.is_member() and user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Server-only config + dedup log (RLS on, no policies => only service role)
-- ---------------------------------------------------------------------------
create table if not exists public.push_config (
  id              int primary key default 1 check (id = 1),
  function_url    text,
  webhook_secret  text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid_public    text,
  vapid_private   text,
  vapid_subject   text
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (id) values (1) on conflict do nothing;

create table if not exists public.push_log (
  event_key   text primary key,
  created_at  timestamptz not null default now()
);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

-- Public VAPID key for subscribing (null until the push function ran once).
create or replace function public.push_public_key()
returns text
language sql stable security definer set search_path = ''
as $$
  select vapid_public from public.push_config where id = 1 and public.is_member();
$$;
revoke execute on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

-- ---------------------------------------------------------------------------
-- Webhook: send ids (never content) to the push function
-- ---------------------------------------------------------------------------
create or replace function public.push_dispatch(event_type text, record_id text, actor uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  cfg public.push_config;
begin
  select * into cfg from public.push_config where id = 1;
  if cfg.function_url is null then
    return; -- push not set up yet
  end if;
  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ours-webhook', cfg.webhook_secret),
    body := jsonb_build_object('type', event_type, 'id', record_id, 'actor', actor),
    timeout_milliseconds := 5000
  );
exception when others then
  -- Never let a notification problem break the actual write.
  raise warning 'push_dispatch failed: %', sqlerrm;
end;
$$;
revoke execute on function public.push_dispatch(text, text, uuid) from public, anon, authenticated;

create or replace function public.push_on_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.push_dispatch(tg_argv[0], new.id::text, coalesce(auth.uid(), null));
  return new;
end;
$$;

create or replace function public.push_on_call_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'ringing' then
    perform public.push_dispatch('call', new.id::text, new.caller_id);
  elsif tg_op = 'UPDATE' and old.status = 'ringing' and new.status in ('missed', 'cancelled') then
    perform public.push_dispatch('call_missed', new.id::text, new.caller_id);
  end if;
  return new;
end;
$$;

drop trigger if exists push_messages on public.messages;
create trigger push_messages after insert on public.messages
  for each row execute function public.push_on_insert('chat');
drop trigger if exists push_letters on public.love_letters;
create trigger push_letters after insert on public.love_letters
  for each row execute function public.push_on_insert('letter');
drop trigger if exists push_memories on public.memories;
create trigger push_memories after insert on public.memories
  for each row execute function public.push_on_insert('memory');
drop trigger if exists push_answers on public.question_answers;
create trigger push_answers after insert on public.question_answers
  for each row execute function public.push_on_insert('answer');
drop trigger if exists push_dates on public.date_ideas;
create trigger push_dates after insert on public.date_ideas
  for each row execute function public.push_on_insert('date');
drop trigger if exists push_pops on public.pops;
create trigger push_pops after insert on public.pops
  for each row execute function public.push_on_insert('surprise');
drop trigger if exists push_calls on public.calls;
create trigger push_calls after insert or update of status on public.calls
  for each row execute function public.push_on_call_change();

-- Daily question reminder at 10:00 Berlin time (pg_cron runs in UTC, so check every hour).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'ours-daily-question';
    perform cron.schedule(
      'ours-daily-question',
      '0 * * * *',
      $cron$
        select public.push_dispatch('daily_question', public.berlin_today()::text, null)
        where extract(hour from (now() at time zone 'Europe/Berlin')) = 10;
      $cron$
    );
  end if;
end $$;

-- Register this browser's subscription for me. A browser endpoint belongs to whoever
-- is signed in on that browser now, so an older registration of it is replaced.
create or replace function public.push_register(sub_endpoint text, sub_p256dh text, sub_auth text, sub_device uuid, sub_label text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if sub_endpoint !~ '^https://' or char_length(sub_endpoint) > 1000 then
    raise exception 'invalid endpoint';
  end if;
  delete from public.push_subscriptions where endpoint = sub_endpoint and user_id <> auth.uid();
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device_id, label)
  values (auth.uid(), sub_endpoint, left(sub_p256dh, 200), left(sub_auth, 100), sub_device, left(sub_label, 60))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    device_id = excluded.device_id, label = excluded.label, failures = 0, last_error = null
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.push_register(text, text, text, uuid, text) from public, anon;
grant execute on function public.push_register(text, text, text, uuid, text) to authenticated;
