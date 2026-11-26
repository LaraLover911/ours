import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { exchangeCode, saveTokens, spotifyApi, spotifyConfigured } from "@/lib/server/spotify";

export async function GET(req: NextRequest) {
  const back = new URL("/integrations", req.nextUrl.origin);
  const fail = (code: string) => {
    back.searchParams.set("error", code);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: "ours_spotify_oauth", path: "/api/integrations/spotify" });
    return res;
  };
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  if (!spotifyConfigured()) return fail("spotify_not_configured");
  const [state, verifier] = (req.cookies.get("ours_spotify_oauth")?.value ?? "").split(".");
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return fail("spotify_denied");
  if (!state || !verifier || q.get("state") !== state || !q.get("code")) return fail("spotify_state");
  try {
    const { tokens, scopes } = await exchangeCode(q.get("code")!, `${req.nextUrl.origin}/api/integrations/spotify/callback`, verifier);
    const me = await spotifyApi<{ id: string; display_name?: string; product?: string }>(tokens.access_token, "/me");
    await saveTokens(auth.supabase, tokens, me.display_name ?? me.id, scopes);
    await auth.supabase.rpc("spotify_save", { p_user: me.id, p_name: me.display_name ?? me.id, p_product: me.product ?? "unknown" });
  } catch (e) {
    console.error("spotify callback", e instanceof Error ? e.message : e);
    return fail("spotify_failed");
  }
  back.searchParams.set("connected", "spotify");
  const res = NextResponse.redirect(back);
  res.cookies.delete({ name: "ours_spotify_oauth", path: "/api/integrations/spotify" });
  return res;
}
