"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { supabaseKey, supabaseUrl } from "./env";

export type TypedClient = SupabaseClient<Database>;

let browserClient: TypedClient | undefined;

/** Singleton browser client. Uses only the publishable (anon) key — never the service role. */
export function getSupabaseBrowserClient(): TypedClient {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl, supabaseKey);
  }
  return browserClient;
}
