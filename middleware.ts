import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeAuthRedirect } from "@/lib/auth/redirect";
import { isSiteAdmin } from "@/lib/auth/admin";
import { Database } from "@/types/database";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh auth tokens if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Protect /admin routes
  if (pathname.startsWith("/admin")) {
    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirect", pathname);
      const response = NextResponse.redirect(redirectUrl);
      supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
      return response;
    }
  }

  // Protect /account routes
  if (pathname.startsWith("/account")) {
    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirect", pathname);
      const response = NextResponse.redirect(redirectUrl);
      supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
      return response;
    }
  }

  // Redirect away from /login if already authenticated
  if (pathname === "/login" && user && !request.nextUrl.searchParams.has("code") && !request.nextUrl.searchParams.has("token_hash")) {
    const isAdmin = isSiteAdmin(user);
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    const target = safeAuthRedirect(redirectParam, isAdmin ? "/admin" : "/account");
    const redirectUrl = new URL(target, request.url);
    const response = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach(cookie => response.cookies.set(cookie));
    return response;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static assets (.svg, .png, .jpg, .jpeg, .gif, .webp, .mp3, .wav)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav)$).*)",
  ],
};
