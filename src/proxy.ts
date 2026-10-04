import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/redirect";
import { updateSession } from "@/lib/supabase/proxy";

// Routes reachable without a session. Everything else redirects to /login.
const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/submit", "/api/webhooks"];
const PUBLIC_EXACT = ["/", "/pricing"];
// Signed-in users skip these and go to `next` (or their dashboard).
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (isAuthenticated && matches(pathname, AUTH_PAGES)) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return redirectPreservingCookies(request, response, next);
  }

  const isPublic = PUBLIC_EXACT.includes(pathname) || matches(pathname, PUBLIC_PREFIXES);
  if (!isAuthenticated && !isPublic) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return redirectPreservingCookies(request, response, login);
  }

  return response;
}

// A redirect must carry any refreshed session cookies, or the user is
// signed out on the next request.
function redirectPreservingCookies(request: NextRequest, from: NextResponse, to: string | URL) {
  const redirect = NextResponse.redirect(new URL(to, request.url));
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Skip static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
