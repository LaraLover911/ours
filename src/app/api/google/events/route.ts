import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { googleAccessToken } from "@/lib/server/google";
import { getJson, rateLimited } from "@/lib/server/integrations";

type GEvent = { id: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; htmlLink?: string; status?: string };

/** Your own upcoming Google Calendar events (title and time only), read-only. */
export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  if (rateLimited(`gcal:${auth.uid}`, 20)) return NextResponse.json({ error: "Zu viele Anfragen, kurz warten" }, { status: 429 });
  const token = await googleAccessToken(auth.supabase);
  if (!token) return NextResponse.json({ error: "Google Kalender ist nicht verbunden" }, { status: 404 });
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 14));
  const now = new Date();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.search = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + days * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
    fields: "items(id,summary,start,end,htmlLink,status)",
  }).toString();
  try {
    const r = await getJson<{ items?: GEvent[] }>(url.toString(), { headers: { Authorization: `Bearer ${token}` } }, "Google Kalender");
    return NextResponse.json({
      items: (r.items ?? [])
        .filter((e) => e.status !== "cancelled")
        .map((e) => ({
          id: e.id,
          title: (e.summary ?? "(ohne Titel)").slice(0, 200),
          start: e.start?.dateTime ?? e.start?.date ?? null,
          end: e.end?.dateTime ?? e.end?.date ?? null,
          allDay: !e.start?.dateTime,
          link: e.htmlLink?.startsWith("https://www.google.com/calendar") ? e.htmlLink : null,
        })),
    });
  } catch (e) {
    await auth.supabase.rpc("integration_mark", { p_provider: "google_calendar", p_status: "error", p_error: e instanceof Error ? e.message : "Fehler" });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Google Kalender nicht erreichbar" }, { status: 502 });
  }
}
