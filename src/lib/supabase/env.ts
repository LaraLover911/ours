// Public project config. These two values are designed to be public (they ship to every
// browser anyway); data is protected by Row Level Security. Env vars override them.
// NEVER put the secret / service_role key here.
const PROJECT_URL = "https://ffktmxfikgqlgfzvgrme.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_c-SPwYvzKbfcqa4ngFbvYQ_KOukG7J7";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || PROJECT_URL;
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const MEDIA_BUCKET = "media";
