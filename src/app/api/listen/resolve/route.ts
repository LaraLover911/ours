import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { linkFor, parseLink } from "@/lib/listen/sources";

/**
 * Title and cover for a YouTube/Spotify link via the providers' official oEmbed
 * endpoints (no keys needed). Only those two hosts are ever fetched.
 */
export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const src = parseLink(req.nextUrl.searchParams.get("url") ?? "");
  if (!src) return NextResponse.json({ error: "Das ist kein YouTube- oder Spotify-Link." }, { status: 400 });
  const page = linkFor(src);
  const endpoint =
    src.provider === "youtube"
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`
      : `https://open.spotify.com/oembed?url=${encodeURIComponent(page)}`;
  try {
    const res = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return NextResponse.json({ error: res.status === 404 || res.status === 401 ? "Dieses Video oder dieser Song ist nicht abrufbar oder nicht einbettbar." : `Anbieter antwortet mit ${res.status}` }, { status: 422 });
    }
    const o = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return NextResponse.json({
      ...src,
      title: (o.title ?? "Unbekannter Titel").slice(0, 200),
      artist: src.provider === "youtube" ? (o.author_name ?? null) : null,
      thumb: o.thumbnail_url?.startsWith("https://") ? o.thumbnail_url : null,
    });
  } catch {
    return NextResponse.json({ error: "Der Anbieter ist gerade nicht erreichbar." }, { status: 502 });
  }
}
