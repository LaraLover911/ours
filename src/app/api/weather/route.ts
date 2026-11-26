import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { getJson, rateLimited } from "@/lib/server/integrations";

type Forecast = {
  current?: { time: string; temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number; wind_speed_10m: number };
  daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
  timezone?: string;
};

/** Current weather + 3 days for the place a member saved (Open-Meteo, no key). */
export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  if (rateLimited(`wx:${auth.uid}`, 30)) return NextResponse.json({ error: "Zu viele Anfragen, kurz warten" }, { status: 429 });
  const user = req.nextUrl.searchParams.get("user") ?? auth.uid;
  if (!/^[0-9a-f-]{36}$/.test(user)) return NextResponse.json({ error: "Ungültig" }, { status: 400 });
  const { data: place } = await auth.supabase.from("weather_places").select("*").eq("user_id", user).maybeSingle();
  if (!place) return NextResponse.json({ error: "Kein Ort gespeichert" }, { status: 404 });
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "3",
    timezone: "auto",
  }).toString();
  try {
    const r = await getJson<Forecast>(url.toString(), undefined, "Open-Meteo");
    return NextResponse.json(
      { place: { name: place.name, country: place.country }, current: r.current ?? null, daily: r.daily ?? null, timezone: r.timezone ?? null, source: "Open-Meteo.com" },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Wetter nicht erreichbar" }, { status: 502 });
  }
}
