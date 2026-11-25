import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from "./env";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/auth", "/setup"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session on every request and guards private routes.
 * Photos in /images and /photos are private too, so they also require a session.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isSupabaseConfigured) {
    if (pathname.startsWith("/setup")) return NextResponse.next();
    if (pathname.startsWith("/images") || pathname.startsWith("/photos")) {
      return new NextResponse(null, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // getClaims() validates the JWT; never trust getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  const isAuthed = Boolean(data?.claims?.sub);

  if (!isAuthed && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (pathname.startsWith("/images") || pathname.startsWith("/photos")) {
      return new NextResponse(null, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(url);
  }

  if (isAuthed && (pathname === "/login" || pathname === "/register" || pathname === "/setup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/images") || pathname.startsWith("/photos")) {
    response.headers.set("Cache-Control", "private, max-age=86400");
  }

  return response;
}
