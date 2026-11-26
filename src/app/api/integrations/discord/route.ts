import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { canEncrypt } from "@/lib/server/crypto";
import { DISCORD_WEBHOOK, saveWebhook, verifyWebhook } from "@/lib/server/discord";
import { rateLimited } from "@/lib/server/integrations";

/** Save (after checking it with Discord) or remove your Discord webhook. */
export async function POST(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  if (!canEncrypt()) return NextResponse.json({ error: "Auf dem Server fehlt INTEGRATIONS_ENCRYPTION_KEY" }, { status: 503 });
  if (rateLimited(`discord-save:${auth.uid}`, 10)) return NextResponse.json({ error: "Zu viele Versuche, kurz warten" }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!DISCORD_WEBHOOK.test(url)) return NextResponse.json({ error: "Das ist keine Discord-Webhook-URL (https://discord.com/api/webhooks/…)" }, { status: 400 });
  try {
    const name = await verifyWebhook(url);
    await saveWebhook(auth.supabase, url, name);
    return NextResponse.json({ ok: true, name });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Discord nicht erreichbar" }, { status: 502 });
  }
}

export async function DELETE() {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  await auth.supabase.from("integration_connections").delete().eq("user_id", auth.uid).eq("provider", "discord");
  return NextResponse.json({ ok: true });
}
