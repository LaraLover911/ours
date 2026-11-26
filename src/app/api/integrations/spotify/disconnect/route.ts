import { NextResponse } from "next/server";
import { requireMember } from "@/lib/server/member";

export async function POST() {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  // Tokens are deleted with the connection (foreign key cascade).
  await auth.supabase.from("integration_connections").delete().eq("user_id", auth.uid).eq("provider", "spotify");
  await auth.supabase.from("spotify_connections").delete().eq("user_id", auth.uid);
  return NextResponse.json({ ok: true });
}
