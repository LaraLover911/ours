import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canEncrypt, open, seal } from "./crypto";

/**
 * Google Calendar (official OAuth 2.0 + Calendar API v3), read-only. Needs
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET plus INTEGRATIONS_ENCRYPTION_KEY.
 */
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly"];
export const googleConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && canEncrypt();

type Tokens = { access_token: string; refresh_token: string; expires_at: number };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? json.error ?? `Google antwortet mit ${res.status}`);
  return json;
}

export async function exchangeGoogleCode(code: string, redirectUri: string, verifier: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
  // The id_token comes straight from Google's token endpoint over TLS; we only read the e-mail as a label.
  let email: string | null = null;
  try {
    email = JSON.parse(Buffer.from((t.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8")).email ?? null;
  } catch {
    email = null;
  }
  return {
    tokens: { access_token: t.access_token!, refresh_token: t.refresh_token ?? "", expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 },
    scopes: (t.scope ?? "").split(" ").filter(Boolean),
    email,
  };
}

export async function saveGoogleTokens(supabase: SupabaseClient, tokens: Tokens, label: string | null, scopes: string[]) {
  const { error } = await supabase.rpc("integration_save", {
    p_provider: "google_calendar",
    p_label: label,
    p_scopes: scopes,
    p_ciphertext: seal(tokens),
    p_expires_at: new Date(tokens.expires_at).toISOString(),
  });
  if (error) throw error;
}

async function storedTokens(supabase: SupabaseClient): Promise<Tokens | null> {
  const { data, error } = await supabase.rpc("integration_token", { p_provider: "google_calendar" });
  if (error || !data?.length) return null;
  return open<Tokens>(data[0].ciphertext);
}

export async function googleAccessToken(supabase: SupabaseClient): Promise<string | null> {
  let tokens = await storedTokens(supabase);
  if (!tokens) return null;
  if (tokens.expires_at - Date.now() < 60_000) {
    if (!tokens.refresh_token) return null;
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
      tokens = { access_token: t.access_token!, refresh_token: t.refresh_token || tokens.refresh_token, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 };
      const { data: conn } = await supabase.from("integration_connections").select("account_label, scopes").eq("provider", "google_calendar").maybeSingle();
      await saveGoogleTokens(supabase, tokens, conn?.account_label ?? null, conn?.scopes ?? []);
    } catch (e) {
      await supabase.rpc("integration_mark", { p_provider: "google_calendar", p_status: "expired", p_error: e instanceof Error ? e.message : "Refresh fehlgeschlagen" });
      return null;
    }
  }
  return tokens.access_token;
}

/** Revoke at Google (best effort) before the connection is deleted here. */
export async function revokeGoogle(supabase: SupabaseClient) {
  const tokens = await storedTokens(supabase).catch(() => null);
  const token = tokens?.refresh_token || tokens?.access_token;
  if (!token) return;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(5000) }).catch(() => undefined);
}
