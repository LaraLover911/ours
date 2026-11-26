import { NextResponse } from "next/server";
import { requireMember } from "@/lib/server/member";
import { revokeGoogle } from "@/lib/server/google";

export async function POST() {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  await revokeGoogle(auth.supabase);
  await auth.supabase.from("integration_connections").delete().eq("user_id", auth.uid).eq("provider", "google_calendar");
  return NextResponse.json({ ok: true });
}
