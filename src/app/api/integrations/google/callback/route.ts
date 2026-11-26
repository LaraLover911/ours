import { NextResponse, type NextRequest } from "next/server";
import { requireMember } from "@/lib/server/member";
import { exchangeGoogleCode, googleConfigured, saveGoogleTokens } from "@/lib/server/google";

export async function GET(req: NextRequest) {
  const back = new URL("/integrations", req.nextUrl.origin);
  const fail = (code: string) => {
    back.searchParams.set("error", code);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: "ours_google_oauth", path: "/api/integrations/google" });
    return res;
  };
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  if (!googleConfigured()) return fail("google_not_configured");
  const [state, verifier] = (req.cookies.get("ours_google_oauth")?.value ?? "").split(".");
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return fail("google_denied");
  if (!state || !verifier || q.get("state") !== state || !q.get("code")) return fail("google_state");
  try {
    const { tokens, scopes, email } = await exchangeGoogleCode(q.get("code")!, `${req.nextUrl.origin}/api/integrations/google/callback`, verifier);
    if (!scopes.some((s) => s.includes("calendar"))) return fail("google_scope");
    await saveGoogleTokens(auth.supabase, tokens, email, scopes);
  } catch (e) {
    console.error("google callback", e instanceof Error ? e.message : e);
    return fail("google_failed");
  }
  back.searchParams.set("connected", "google_calendar");
  const res = NextResponse.redirect(back);
  res.cookies.delete({ name: "ours_google_oauth", path: "/api/integrations/google" });
  return res;
}
