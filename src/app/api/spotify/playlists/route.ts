import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { accessToken, spotifyApi, toItem, type SpotifyTrack } from "@/lib/server/spotify";

/** Without ?id: your playlists. With ?id=…: the tracks of one playlist (for importing). */
export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const t = await accessToken(auth.supabase);
  if (!t) return NextResponse.json({ error: "Spotify ist nicht verbunden" }, { status: 404 });
  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) {
      if (!/^[A-Za-z0-9]{22}$/.test(id)) return NextResponse.json({ error: "Ungültige Playlist" }, { status: 400 });
      const r = await spotifyApi<{ items: { track: SpotifyTrack | null }[] }>(t.token, `/playlists/${id}/tracks?limit=100&market=from_token`);
      return NextResponse.json({ items: r.items.map((i) => i.track).filter((x): x is SpotifyTrack => !!x && x.uri.startsWith("spotify:track:")).map(toItem) });
    }
    const r = await spotifyApi<{ items: { id: string; name: string; tracks?: { total: number }; images?: { url: string }[] }[] }>(t.token, "/me/playlists?limit=50");
    return NextResponse.json({ playlists: r.items.map((p) => ({ id: p.id, name: p.name, total: p.tracks?.total ?? 0, image: p.images?.[0]?.url ?? null })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Spotify antwortet nicht" }, { status: 502 });
  }
}
