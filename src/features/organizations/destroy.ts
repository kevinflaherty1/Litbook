import "server-only";

import { serverEnv } from "@/lib/env.server";
import { billingEnabled, getStripe } from "@/lib/stripe";
import { removeStoragePrefix } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";

export class BillingNotConfiguredError extends Error {}

/**
 * Permanently deletes a workspace: cancels its Stripe subscription, removes
 * its files, then deletes the org (cascading to all its data). Callers must
 * have authorised this (workspace owner). Uses the service role.
 */
export async function destroyOrganization(orgId: string) {
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("organizations")
    .select("stripe_subscription_id, subscription_status")
    .eq("id", orgId)
    .single();
  if (error) throw error;

  // Stop billing first: if this fails, nothing has been deleted yet.
  if (row.stripe_subscription_id && row.subscription_status && row.subscription_status !== "canceled") {
    if (!billingEnabled || !serverEnv.STRIPE_SECRET_KEY) throw new BillingNotConfiguredError();
    try {
      await getStripe().subscriptions.cancel(row.stripe_subscription_id);
    } catch (stripeError) {
      // Already cancelled or deleted in Stripe: fine to proceed.
      if ((stripeError as { code?: string }).code !== "resource_missing") throw stripeError;
    }
  }

  await Promise.all([removeStoragePrefix(`${orgId}/`), removeStoragePrefix(`${orgId}/`, "org-branding")]);
  const { error: deleteError } = await admin.from("organizations").delete().eq("id", orgId);
  if (deleteError) throw deleteError;
}
