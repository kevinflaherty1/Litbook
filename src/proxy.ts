import { NextResponse, type NextRequest } from "next/server";

import { buildCsp, generateNonce } from "@/lib/csp";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";
import { updateSession } from "@/lib/supabase/proxy";

// Routes reachable without a session. Everything else redirects to /login.
const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/submit", "/api/webhooks", "/api/health"];
const PUBLIC_EXACT = ["/", "/pricing", "/robots.txt"];
// Signed-in users skip these and go to `next` (or their dashboard).
const AUTH_PAGES = ["/login", "/signup"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  // A fresh nonce per request: Next.js reads it from the request's CSP header
  // and applies it to its own scripts; the root layout reads x-nonce.
  const csp = buildCsp({
    nonce: generateNonce(),
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    isDev: process.env.NODE_ENV === "development",
  });
  request.headers.set("x-nonce", csp.match(/'nonce-([^']+)'/)![1]);
  request.headers.set("Content-Security-Policy", csp);

  const result = await routeRequest(request);
  result.headers.set("Content-Security-Policy", csp);
  return result;
}

async function routeRequest(request: NextRequest) {
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
