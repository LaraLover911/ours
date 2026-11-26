import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { open, seal } from "./crypto";

/** Discord incoming webhooks (official, no bot). The URL is a secret, so it is stored sealed. */
export const DISCORD_WEBHOOK = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/(\d{5,30})\/([\w-]{20,120})$/;

export async function verifyWebhook(url: string) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 404 ? "Discord kennt diesen Webhook nicht (gelöscht oder falsch kopiert)" : `Discord antwortet mit ${res.status}`);
  const j = (await res.json()) as { name?: string };
  return j.name ?? "Discord-Webhook";
}

export async function saveWebhook(supabase: SupabaseClient, url: string, label: string) {
  const { error } = await supabase.rpc("integration_save", { p_provider: "discord", p_label: label, p_scopes: ["webhook"], p_ciphertext: seal({ url }), p_expires_at: null });
  if (error) throw error;
}

export async function postWebhook(supabase: SupabaseClient, content: string) {
  const { data, error } = await supabase.rpc("integration_token", { p_provider: "discord" });
  if (error || !data?.length) throw new Error("Discord ist nicht verbunden");
  const { url } = open<{ url: string }>(data[0].ciphertext);
  if (!DISCORD_WEBHOOK.test(url)) throw new Error("Gespeicherter Webhook ist ungültig");
  const res = await fetch(`${url}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: content.slice(0, 1800), username: "ours.", allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) {
    const msg = res.status === 404 ? "Der Webhook existiert nicht mehr" : res.status === 429 ? "Discord bremst gerade (zu viele Nachrichten)" : `Discord antwortet mit ${res.status}`;
    await supabase.rpc("integration_mark", { p_provider: "discord", p_status: "error", p_error: msg });
    throw new Error(msg);
  }
}
