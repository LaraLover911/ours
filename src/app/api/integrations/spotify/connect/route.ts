import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { requireMember } from "@/lib/server/member";
import { SPOTIFY_SCOPES, spotifyConfigured } from "@/lib/server/spotify";

export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const back = new URL("/integrations", req.nextUrl.origin);
  if (!spotifyConfigured()) {
    back.searchParams.set("error", "spotify_not_configured");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: `${req.nextUrl.origin}/api/integrations/spotify/callback`,
    scope: SPOTIFY_SCOPES.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("ours_spotify_oauth", `${state}.${verifier}`, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/integrations/spotify",
    maxAge: 600,
  });
  return res;
}
