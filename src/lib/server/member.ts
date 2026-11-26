import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/** The signed-in member for an API route, or a 401/403 response. */
export async function requireMember() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const { data: member } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
  if (!member) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) } as const;
  return { supabase, uid } as const;
}
