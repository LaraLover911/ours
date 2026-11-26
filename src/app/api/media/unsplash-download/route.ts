import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { integrationStatus, rateLimited } from "@/lib/server/integrations";

/** Unsplash asks apps to ping the photo's download endpoint when a photo is actually used. */
export async function POST(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  if (!integrationStatus().unsplash.configured) return NextResponse.json({ error: "Unsplash ist nicht eingerichtet" }, { status: 503 });
  if (rateLimited(`unsplash-dl:${auth.uid}`, 30)) return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 });
  const { location } = (await req.json().catch(() => ({}))) as { location?: string };
  if (typeof location !== "string" || !/^https:\/\/api\.unsplash\.com\/photos\/[\w-]+\/download(\?[\w=&%.-]*)?$/.test(location)) {
    return NextResponse.json({ error: "Ungültig" }, { status: 400 });
  }
  const res = await fetch(location, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  return NextResponse.json({ ok: !!res?.ok });
}
