import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { accessToken, spotifyApi, toItem, type SpotifyTrack } from "@/lib/server/spotify";

export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ items: [] });
  const t = await accessToken(auth.supabase);
  if (!t) return NextResponse.json({ error: "Spotify ist nicht verbunden" }, { status: 404 });
  try {
    const r = await spotifyApi<{ tracks: { items: SpotifyTrack[] } }>(t.token, `/search?type=track&limit=12&market=from_token&q=${encodeURIComponent(q)}`);
    return NextResponse.json({ items: r.tracks.items.map(toItem) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Spotify-Suche fehlgeschlagen" }, { status: 502 });
  }
}
