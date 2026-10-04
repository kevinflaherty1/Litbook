import "server-only";

import Stripe from "stripe";

import { serverEnv } from "@/lib/env.server";

let client: Stripe | null = null;

/** True when Stripe is configured; otherwise billing (and its paywall) is off. */
export const billingEnabled = !!serverEnv.STRIPE_SECRET_KEY;

export function getStripe(): Stripe {
  if (!serverEnv.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY).");
  client ??= new Stripe(serverEnv.STRIPE_SECRET_KEY, { appInfo: { name: "Litbook" } });
  return client;
}

const KNOWN_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;
export type SubscriptionStatus = (typeof KNOWN_STATUSES)[number];

/** Maps Stripe's status onto our enum; unknown future values are ignored. */
export function toSubscriptionStatus(status: string): SubscriptionStatus | null {
  return (KNOWN_STATUSES as readonly string[]).includes(status) ? (status as SubscriptionStatus) : null;
}

/** The fields we store, from a Subscription object (period end lives on its items). */
export function subscriptionFields(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  return {
    customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscription: sub.id,
    price: item?.price.id ?? null,
    status: toSubscriptionStatus(sub.status),
    currentPeriodEnd: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    orgId: sub.metadata?.organization_id || null,
  };
}
