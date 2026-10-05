import "server-only";

import { fail, type ActionResult } from "@/lib/action-result";
import { planAllows, PRO_REQUIRED, type ProFeature } from "@/lib/plans";
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

export async function getOrgPlan(supabase: ServerClient, orgId: string) {
  const { data, error } = await supabase.from("organizations").select("plan").eq("id", orgId).single();
  if (error) throw error;
  return data.plan;
}

/** Pro-only features. Returns a failure to hand back, or null to continue. */
export async function requireProFeature(
  supabase: ServerClient,
  orgId: string,
  feature: ProFeature,
): Promise<ActionResult<never> | null> {
  if (!billingEnabled) return null;
  return planAllows(await getOrgPlan(supabase, orgId), feature, billingEnabled) ? null : fail(PRO_REQUIRED);
}
