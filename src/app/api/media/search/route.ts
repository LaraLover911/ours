import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { integrationStatus, rateLimited } from "@/lib/server/integrations";
import { MEDIA_NOTICE, MEDIA_PROVIDERS, searchMedia, type MediaProvider } from "@/lib/server/media";

/** Search GIPHY, Tenor, Unsplash, TMDB or YouTube through the server (keys stay here). */
export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const provider = req.nextUrl.searchParams.get("provider") as MediaProvider;
  if (!MEDIA_PROVIDERS.includes(provider)) return NextResponse.json({ error: "Unbekannter Dienst" }, { status: 400 });
  const status = integrationStatus()[provider === "youtube" ? "youtube_search" : provider];
  if (!status.configured) return NextResponse.json({ error: "Dieser Dienst ist auf dem Server nicht eingerichtet", missing: status.missing }, { status: 503 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ items: [], notice: MEDIA_NOTICE[provider] });
  if (rateLimited(`media:${auth.uid}`, 40)) return NextResponse.json({ error: "Zu viele Suchen, kurz warten" }, { status: 429 });
  try {
    return NextResponse.json({ items: await searchMedia(provider, q), notice: MEDIA_NOTICE[provider] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Suche fehlgeschlagen" }, { status: 502 });
  }
}
