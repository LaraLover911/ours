import { NextResponse } from "next/server";
import { requireMember } from "@/lib/server/member";
import { integrationStatus } from "@/lib/server/integrations";

/** Which integrations the server is set up for: booleans and the NAMES of missing variables, never values. */
export async function GET() {
  const auth = await requireMember();
  if ("error" in auth) return auth.error;
  const services = integrationStatus();
  return NextResponse.json({ services, spotify: services.spotify.configured });
}
