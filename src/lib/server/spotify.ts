import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canEncrypt, open, seal } from "./crypto";

/**
 * Spotify (official Web API + Accounts service). Needs SPOTIFY_CLIENT_ID and
 * SPOTIFY_CLIENT_SECRET plus INTEGRATIONS_ENCRYPTION_KEY on the server. Tokens
 * are sealed before they reach the database and refreshed here when they expire.
 */
export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private",
  "playlist-read-collaborative",
];

export const spotifyConfigured = () => !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET && canEncrypt();

type Tokens = { access_token: string; refresh_token: string; expires_at: number };

function basic() {
  return "Basic " + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? json.error ?? `Spotify antwortet mit ${res.status}`);
  return json;
}

export async function exchangeCode(code: string, redirectUri: string, verifier: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
  return { tokens: { access_token: t.access_token!, refresh_token: t.refresh_token ?? "", expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 }, scopes: (t.scope ?? "").split(" ").filter(Boolean) };
}

export async function saveTokens(supabase: SupabaseClient, tokens: Tokens, label: string | null, scopes: string[]) {
  const { error } = await supabase.rpc("integration_save", {
    p_provider: "spotify",
    p_label: label,
    p_scopes: scopes,
    p_ciphertext: seal(tokens),
    p_expires_at: new Date(tokens.expires_at).toISOString(),
  });
  if (error) throw error;
}

/** A valid access token for the signed-in member, refreshing it when needed. */
export async function accessToken(supabase: SupabaseClient): Promise<{ token: string; expiresAt: number } | null> {
  const { data, error } = await supabase.rpc("integration_token", { p_provider: "spotify" });
  if (error || !data?.length) return null;
  let tokens = open<Tokens>(data[0].ciphertext);
  if (tokens.expires_at - Date.now() < 60_000) {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
      tokens = { access_token: t.access_token!, refresh_token: t.refresh_token || tokens.refresh_token, expires_at: Date.now() + (t.expires_in ?? 3600) * 1000 };
      const { data: conn } = await supabase.from("integration_connections").select("account_label, scopes").eq("provider", "spotify").maybeSingle();
      await saveTokens(supabase, tokens, conn?.account_label ?? null, conn?.scopes ?? []);
    } catch (e) {
      await supabase.rpc("integration_mark", { p_provider: "spotify", p_status: "expired", p_error: e instanceof Error ? e.message : "Refresh fehlgeschlagen" });
      return null;
    }
  }
  return { token: tokens.access_token, expiresAt: tokens.expires_at };
}

export async function spotifyApi<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: { message?: string } }).error?.message ?? `Spotify antwortet mit ${res.status}`);
  return json as T;
}

export type SpotifyTrack = { uri: string; name: string; duration_ms: number; artists: { name: string }[]; album?: { images?: { url: string; width: number }[] } };
export const toItem = (t: SpotifyTrack) => ({
  provider: "spotify" as const,
  ref: t.uri,
  title: t.name,
  artist: t.artists.map((a) => a.name).join(", "),
  thumb: t.album?.images?.slice().sort((a, b) => a.width - b.width).find((i) => i.width >= 64)?.url ?? null,
  duration_ms: t.duration_ms,
});
