import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Service-role client. BYPASSES RLS — use only for the guest portal RPCs,
 * Stripe webhooks, and signed upload URLs, after validating the caller some
 * other way (e.g. an onboarding token).
 */
export function createAdminClient() {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
