import { NextResponse } from "next/server";
import { requireMember } from "@/lib/server/member";
import { postWebhook } from "@/lib/server/discord";
import { rateLimited } from "@/lib/server/integrations";

/** Sends one test message to your own webhook. */
export async function POST() {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  if (rateLimited(`discord-test:${auth.uid}`, 5)) return NextResponse.json({ error: "Zu viele Testnachrichten, kurz warten" }, { status: 429 });
  try {
    await postWebhook(auth.supabase, "💌 ours. ist mit diesem Kanal verbunden (Testnachricht).");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Senden fehlgeschlagen" }, { status: 502 });
  }
}
