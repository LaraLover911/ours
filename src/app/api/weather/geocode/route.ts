import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { getJson, rateLimited } from "@/lib/server/integrations";

type Hit = { name: string; latitude: number; longitude: number; country?: string; admin1?: string; timezone?: string };

/** Place search for a city you type (Open-Meteo geocoding, no key, no geolocation, no IP lookup). */
export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ items: [] });
  if (rateLimited(`geo:${auth.uid}`, 30)) return NextResponse.json({ error: "Zu viele Anfragen, kurz warten" }, { status: 429 });
  try {
    const r = await getJson<{ results?: Hit[] }>(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=de&format=json&name=${encodeURIComponent(q)}`, undefined, "Open-Meteo");
    return NextResponse.json({
      items: (r.results ?? []).map((h) => ({ name: h.name, region: h.admin1 ?? null, country: h.country ?? null, lat: h.latitude, lon: h.longitude, timezone: h.timezone ?? null })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ortssuche nicht erreichbar" }, { status: 502 });
  }
}
