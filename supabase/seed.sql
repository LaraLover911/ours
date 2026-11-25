-- Local development only (runs on `supabase db reset`, never on your hosted project).
-- Invites two local test accounts. For production, insert your real emails
-- in the Supabase SQL editor (see README).
insert into public.invites (email, role, display_name) values
  ('abdullah@ours.local', 'abdullah', 'Abdullah'),
  ('lara@ours.local', 'lara', 'Lara')
on conflict (email) do nothing;
