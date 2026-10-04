"use server";

import { redirect } from "next/navigation";

import { fail } from "@/lib/action-result";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { orgAction } from "@/lib/safe-action";
import { billingEnabled, getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingActionSchema } from "@/schemas/billing";

const NOT_CONFIGURED = "Billing isn't set up for this deployment.";
const LIVE_STATUSES = ["trialing", "active", "past_due", "unpaid", "paused"];

/**
 * Sends an owner/admin to Stripe Checkout for Litbook Pro. Creates the Stripe
 * customer on first use. If the org already has a live subscription, sends
 * them to the Customer Portal instead, so nobody subscribes twice.
 */
export const startCheckout = orgAction(
  billingActionSchema,
  { roles: ["owner", "admin"] },
  async (_input, { supabase, org, user }) => {
    if (!billingEnabled || !serverEnv.STRIPE_PRICE_ID) return fail(NOT_CONFIGURED);
    const stripe = getStripe();

    const { data: row, error } = await supabase
      .from("organizations")
      .select("name, stripe_customer_id, subscription_status")
      .eq("id", org.id)
      .single();
    if (error) throw error;

    let customerId = row.stripe_customer_id;
    if (row.subscription_status && LIVE_STATUSES.includes(row.subscription_status) && customerId) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: billingUrl(org.slug),
      });
      redirect(portal.url);
    }

    if (!customerId) {
      const customer = await stripe.customers.create(
        { name: row.name, email: user.email ?? undefined, metadata: { organization_id: org.id } },
        { idempotencyKey: `customer-${org.id}` },
      );
      customerId = customer.id;
      // Billing columns aren't writable by signed-in users; this is server-side after the role check.
      const { error: saveError } = await createAdminClient()
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", org.id)
        .is("stripe_customer_id", null);
      if (saveError) throw saveError;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: org.id,
      line_items: [{ price: serverEnv.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        metadata: { organization_id: org.id },
        ...(serverEnv.STRIPE_TRIAL_DAYS > 0 ? { trial_period_days: serverEnv.STRIPE_TRIAL_DAYS } : {}),
      },
      // A trial doesn't need a card up front.
      payment_method_collection: "if_required",
      allow_promotion_codes: true,
      success_url: `${billingUrl(org.slug)}?checkout=success`,
      cancel_url: billingUrl(org.slug),
    });
    if (!session.url) return fail("Stripe didn't return a checkout page. Please try again.");
    redirect(session.url);
  },
);

/** Opens the Stripe Customer Portal for plan changes, payment details and cancelling. */
export const openBillingPortal = orgAction(
  billingActionSchema,
  { roles: ["owner", "admin"] },
  async (_input, { supabase, org }) => {
    if (!billingEnabled) return fail(NOT_CONFIGURED);
    const { data: row, error } = await supabase
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", org.id)
      .single();
    if (error) throw error;
    if (!row.stripe_customer_id) return fail("There's no billing account yet. Start a subscription first.");

    const portal = await getStripe().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: billingUrl(org.slug),
    });
    redirect(portal.url);
  },
);

function billingUrl(slug: string) {
  return new URL(`/${slug}/settings/billing`, env.NEXT_PUBLIC_SITE_URL).toString();
}
