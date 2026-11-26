import { NextResponse } from "next/server";
import { requireMember } from "@/lib/server/member";
import { spotifyConfigured } from "@/lib/server/spotify";

/** Which integrations the server is set up for (booleans only, never values). */
export async function GET() {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  return NextResponse.json({
    spotify: spotifyConfigured(),
  });
}
