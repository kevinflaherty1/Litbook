"use server";

import { redirect } from "next/navigation";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";
import { fieldErrorsOf } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { oauthSchema, signInSchema, signUpSchema, type SignInInput, type SignUpInput } from "@/schemas/auth";

/** Emails a magic link. Creates the account on first use. */
export async function signInWithEmail(raw: SignInInput): Promise<ActionResult<{ email: string }>> {
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return fail("Enter a valid email address.", fieldErrorsOf(parsed.error));
  return sendMagicLink(parsed.data.email, parsed.data.next);
}

/** Same as sign-in, but records the user's name on the new account. */
export async function signUpWithEmail(raw: SignUpInput): Promise<ActionResult<{ email: string }>> {
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsOf(parsed.error));
  return sendMagicLink(parsed.data.email, parsed.data.next, { full_name: parsed.data.fullName });
}

async function sendMagicLink(
  email: string,
  next: string | undefined,
  data?: Record<string, string>,
): Promise<ActionResult<{ email: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: new URL(safeNextPath(next), env.NEXT_PUBLIC_SITE_URL).toString(),
      data,
    },
  });

  if (error) {
    if (error.status === 429) {
      return fail("Too many sign-in emails. Wait a minute and try again.");
    }
    console.error("[auth] signInWithOtp failed", error);
    return fail("We couldn't send your sign-in link. Please try again.");
  }
  return ok({ email });
}

export async function signInWithOAuth(raw: { provider: "google"; next?: string }) {
  const parsed = oauthSchema.safeParse(raw);
  if (!parsed.success || !env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED) redirect("/login?error=oauth");

  const callback = new URL("/auth/callback", env.NEXT_PUBLIC_SITE_URL);
  callback.searchParams.set("next", safeNextPath(parsed.data.next));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: parsed.data.provider,
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) {
    console.error("[auth] signInWithOAuth failed", error);
    redirect("/login?error=oauth");
  }
  redirect(data.url);
}

/** Signs out; `next` (validated) lets the user sign back in as someone else. */
export async function signOut(next?: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(next ? `/login?next=${encodeURIComponent(safeNextPath(next))}` : "/login");
}
