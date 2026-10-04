import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/** OAuth (PKCE) return URL: exchanges ?code= for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    console.error("[auth] exchangeCodeForSession failed", error);
  }

  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
