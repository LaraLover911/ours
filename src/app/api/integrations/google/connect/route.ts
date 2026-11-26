import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { requireMember } from "@/lib/server/member";
import { GOOGLE_SCOPES, googleConfigured } from "@/lib/server/google";

export async function GET(req: NextRequest) {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const back = new URL("/integrations", req.nextUrl.origin);
  if (!googleConfigured()) {
    back.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${req.nextUrl.origin}/api/integrations/google/callback`,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("ours_google_oauth", `${state}.${verifier}`, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/integrations/google",
    maxAge: 600,
  });
  return res;
}
