import { NextResponse } from "next/server";
import { requireMember } from "@/lib/server/member";
import { accessToken, spotifyConfigured } from "@/lib/server/spotify";

/** Short-lived access token for the Web Playback SDK in this member's own browser. */
export async function GET() {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  if (!spotifyConfigured()) return NextResponse.json({ error: "Spotify ist nicht eingerichtet" }, { status: 503 });
  const t = await accessToken(auth.supabase);
  if (!t) return NextResponse.json({ error: "Spotify ist nicht verbunden" }, { status: 404 });
  return NextResponse.json({ access_token: t.token, expires_at: t.expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
