import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * ICE servers for calls. STUN is always included. A TURN relay (needed when a
 * direct connection between your networks is impossible, e.g. mobile data with
 * carrier NAT) is only added when it is configured on the server:
 *
 * - Cloudflare Realtime TURN: CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
 *   (short-lived credentials are generated per request, the API token never
 *   leaves the server), or
 * - any TURN server: TURN_URLS (comma separated) + TURN_USERNAME + TURN_CREDENTIAL.
 *
 * Only the two members get credentials.
 */
const STUN: RTCIceServer = { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] };

type IceResponse = { iceServers: RTCIceServer[]; relay: "cloudflare" | "static" | null; error?: string };

async function cloudflare(keyId: string, token: string): Promise<RTCIceServer[]> {
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: 6 * 60 * 60 }),
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`Cloudflare TURN antwortet mit ${res.status}`);
  const body = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
  const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
  // Browsers block port 53; Cloudflare recommends dropping those URLs.
  return list
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length > 0);
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: member } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
  if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const out: IceResponse = { iceServers: [STUN], relay: null };
  const cfId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const cfToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  try {
    if (cfId && cfToken) {
      const servers = await cloudflare(cfId, cfToken);
      if (servers.length) {
        out.iceServers.push(...servers);
        out.relay = "cloudflare";
      }
    } else if (process.env.TURN_URLS) {
      out.iceServers.push({
        urls: process.env.TURN_URLS.split(",").map((u) => u.trim()).filter(Boolean),
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
      out.relay = "static";
    }
  } catch (err) {
    out.error = err instanceof Error ? err.message : "TURN nicht erreichbar";
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
