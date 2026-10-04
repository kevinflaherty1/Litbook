import "server-only";

import { fail, type ActionResult } from "@/lib/action-result";
import { billingEnabled } from "@/lib/stripe";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Creating things (episodes, onboarding links) needs an active or trialing
 * subscription when billing is on. Reading and exporting never do.
 * Returns a failure to hand back from the action, or null to continue.
 */
export async function requireActiveSubscription(
  supabase: ServerClient,
  orgId: string,
): Promise<ActionResult<never> | null> {
  if (!billingEnabled) return null;
  const { data, error } = await supabase.rpc("org_has_active_subscription", { p_org: orgId });
  if (error) throw error;
  return data
    ? null
    : fail(
        "Your workspace needs an active subscription to do this. Start a free trial in Settings → Billing.",
      );
}
