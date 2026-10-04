import type Stripe from "stripe";

import { handleStripeEvent, markEventProcessed, wasEventProcessed } from "@/features/billing/webhook";
import { serverEnv } from "@/lib/env.server";
import { billingEnabled, getStripe } from "@/lib/stripe";

/**
 * Stripe webhook. Verifies the signature against the raw body, skips events
 * already processed, applies the event, then records it. If applying fails we
 * return 500 without recording, so Stripe retries.
 */
export async function POST(request: Request) {
  if (!billingEnabled || !serverEnv.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Billing is not configured." }, { status: 404 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      await request.text(),
      signature,
      serverEnv.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    console.warn(JSON.stringify({ source: "stripe-webhook", outcome: "bad-signature" }));
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    if (await wasEventProcessed(event.id)) return Response.json({ received: true, duplicate: true });
    await handleStripeEvent(event);
    await markEventProcessed(event);
    return Response.json({ received: true });
  } catch (error) {
    console.error(
      JSON.stringify({ source: "stripe-webhook", id: event.id, type: event.type, outcome: "error" }),
      error,
    );
    return Response.json({ error: "Webhook handling failed." }, { status: 500 });
  }
}
