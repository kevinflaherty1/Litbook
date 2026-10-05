import "server-only";

import type Stripe from "stripe";

import { planForPrice, subscriptionFields } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type Outcome = "applied" | "ignored" | "unknown-org";
type ApplyArgs = Database["public"]["Functions"]["apply_stripe_subscription"]["Args"];

/**
 * apply_stripe_subscription() treats NULL as "leave unchanged". Generated RPC
 * types mark every argument non-null, so this is the one place we widen them.
 */
async function applySubscription(args: { [K in keyof ApplyArgs]: ApplyArgs[K] | null }) {
  const { data, error } = await createAdminClient().rpc("apply_stripe_subscription", args as ApplyArgs);
  if (error) throw error;
  return data as string | null;
}

function log(event: Stripe.Event, outcome: Outcome, extra: Record<string, unknown> = {}) {
  console.info(
    JSON.stringify({ source: "stripe-webhook", id: event.id, type: event.type, outcome, ...extra }),
  );
}

/**
 * Applies one verified Stripe event to the database. Every write goes through
 * apply_stripe_subscription(), which ignores events older than the last one
 * applied, so handling is idempotent and safe under out-of-order delivery.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<Outcome> {
  const eventAt = new Date(event.created * 1000).toISOString();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.client_reference_id) {
        log(event, "ignored");
        return "ignored";
      }
      const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscription =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      // Ids only: the subscription.* events carry the status.
      const orgId = await applySubscription({
        p_org: session.client_reference_id,
        p_customer: customer ?? null,
        p_subscription: subscription ?? null,
        p_price: null,
        p_status: null,
        p_current_period_end: null,
        p_cancel_at_period_end: null,
        p_event_at: eventAt,
        p_plan: null,
      });
      log(event, orgId ? "applied" : "unknown-org", { orgId });
      return orgId ? "applied" : "unknown-org";
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const f = subscriptionFields(event.data.object);
      const orgId = await applySubscription({
        p_org: f.orgId,
        p_customer: f.customer,
        p_subscription: f.subscription,
        p_price: f.price,
        p_status: event.type === "customer.subscription.deleted" ? "canceled" : f.status,
        p_current_period_end: f.currentPeriodEnd,
        p_cancel_at_period_end: f.cancelAtPeriodEnd,
        p_event_at: eventAt,
        p_plan: planForPrice(f.price),
      });
      const plan = planForPrice(f.price);
      if (f.price && !plan)
        console.warn(`[stripe-webhook] price ${f.price} doesn't match a plan; plan left unchanged`);
      log(event, orgId ? "applied" : "unknown-org", { orgId, status: f.status, plan });
      return orgId ? "applied" : "unknown-org";
    }

    default:
      log(event, "ignored");
      return "ignored";
  }
}

/** Records a processed event id; returns false if it was already recorded. */
export async function markEventProcessed(event: Stripe.Event) {
  const { error } = await createAdminClient()
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

export async function wasEventProcessed(eventId: string) {
  const { data, error } = await createAdminClient()
    .from("stripe_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
