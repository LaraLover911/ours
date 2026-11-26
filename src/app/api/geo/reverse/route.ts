import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { getJson, rateLimited } from "@/lib/server/integrations";

type Address = Partial<Record<"amenity" | "tourism" | "neighbourhood" | "suburb" | "city_district" | "village" | "town" | "city" | "municipality" | "county" | "state" | "country", string>>;

/**
 * Turns the coordinates stored in a video's own metadata into a place name
 * (OpenStreetMap Nominatim). Only called when someone uploads a clip that
 * carries a location. Coordinates are rounded to ~100 m before they leave the
 * server and are not stored anywhere; only the returned name may be saved.
 */
export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "Ungültige Koordinaten" }, { status: 400 });
  }
  if (rateLimited(`reverse:${auth.uid}`, 10)) return NextResponse.json({ error: "Zu viele Anfragen, kurz warten" }, { status: 429 });
  try {
    const r = await getJson<{ address?: Address; name?: string }>(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&accept-language=de&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`,
      { headers: { "User-Agent": "ours-private-couple-app/1.0 (+https://github.com/LaraLover911/ours)" } },
      "OpenStreetMap",
    );
    const a = r.address ?? {};
    const spot = a.amenity ?? a.tourism ?? null;
    const area = a.suburb ?? a.neighbourhood ?? a.city_district ?? a.village ?? null;
    const city = a.city ?? a.town ?? a.municipality ?? a.village ?? a.county ?? null;
    const parts = [spot, area && area !== city ? area : null, city, city ? null : a.state, a.country].filter((x): x is string => !!x);
    const place = [...new Set(parts)].join(", ").slice(0, 120);
    if (!place) return NextResponse.json({ place: null });
    return NextResponse.json({ place }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ort nicht ermittelbar" }, { status: 502 });
  }
}
