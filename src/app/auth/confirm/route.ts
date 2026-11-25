import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Handles email confirmation, invite and password-reset links (PKCE code or token hash).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await getSupabaseServerClient();
  let error: { message: string } | null = null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    error = { message: "missing token" };
  }

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Der Link ist abgelaufen oder ungültig. Bitte fordere einen neuen an.")}`);
  }
  const destination = type === "recovery" || type === "invite" ? "/reset-password" : next;
  return NextResponse.redirect(`${origin}${destination}`);
}
