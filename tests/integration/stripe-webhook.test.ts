import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Billing must be configured before the app modules read their env.
const WEBHOOK_SECRET = "whsec_integration_test";
process.env.STRIPE_SECRET_KEY = "sk_test_integration";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_PRICE_PRO = "price_pro";
process.env.STRIPE_PRICE_STARTER = "price_starter";

const { POST } = await import("@/app/api/webhooks/stripe/route");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const stripe = new Stripe("sk_test_integration");

const orgId = randomUUID();
const customer = `cus_${randomUUID().slice(0, 8)}`;
const subscriptionId = `sub_${randomUUID().slice(0, 8)}`;
let created = Math.floor(Date.now() / 1000);

function event(type: string, object: Record<string, unknown>, at = created++) {
  return { id: `evt_${randomUUID()}`, object: "event", type, created: at, data: { object } };
}

function subscription(
  status: string,
  periodEnd: number,
  extra: Record<string, unknown> = {},
  price = "price_pro",
) {
  return {
    id: subscriptionId,
    object: "subscription",
    customer,
    status,
    cancel_at_period_end: false,
    metadata: { organization_id: orgId },
    items: { data: [{ price: { id: price }, current_period_end: periodEnd }] },
    ...extra,
  };
}

async function send(evt: object, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(evt);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": header, "content-type": "application/json" },
      body: payload,
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function billing() {
  const { data, error } = await admin
    .from("organizations")
    .select(
      "stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status, current_period_end, cancel_at_period_end, plan",
    )
    .eq("id", orgId)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  const { error } = await admin
    .from("organizations")
    .insert({ id: orgId, name: "Webhook Test", slug: `wh-${orgId.slice(0, 8)}` });
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("organizations").delete().eq("id", orgId);
});

describe("POST /api/webhooks/stripe", () => {
  it("rejects a bad signature", async () => {
    const res = await send(event("customer.subscription.created", subscription("active", 0)), "whsec_wrong");
    expect(res.status).toBe(400);
    expect((await billing()).subscription_status).toBeNull();
  });

  it("links the customer and subscription on checkout completion", async () => {
    const res = await send(
      event("checkout.session.completed", {
        object: "checkout.session",
        mode: "subscription",
        client_reference_id: orgId,
        customer,
        subscription: subscriptionId,
      }),
    );
    expect(res.status).toBe(200);
    expect(await billing()).toMatchObject({
      stripe_customer_id: customer,
      stripe_subscription_id: subscriptionId,
    });
  });

  it("applies subscription status, price and period end", async () => {
    const trialEnd = Math.floor(Date.now() / 1000) + 14 * 86400;
    const res = await send(event("customer.subscription.created", subscription("trialing", trialEnd)));
    expect(res.status).toBe(200);
    const b = await billing();
    expect(b).toMatchObject({
      subscription_status: "trialing",
      stripe_price_id: "price_pro",
      plan: "pro",
      cancel_at_period_end: false,
    });
    expect(new Date(b.current_period_end!).getTime()).toBe(trialEnd * 1000);
  });

  it("skips duplicate deliveries", async () => {
    const evt = event("customer.subscription.updated", subscription("active", 2_000_000_000));
    expect((await send(evt)).body).toEqual({ received: true });
    expect((await send(evt)).body).toEqual({ received: true, duplicate: true });
    expect((await billing()).subscription_status).toBe("active");
  });

  it("maps the price to a plan, and keeps the plan for unknown prices", async () => {
    await send(
      event("customer.subscription.updated", subscription("active", 2_000_000_000, {}, "price_starter")),
    );
    expect(await billing()).toMatchObject({ plan: "starter", stripe_price_id: "price_starter" });
    await send(
      event("customer.subscription.updated", subscription("active", 2_000_000_000, {}, "price_legacy")),
    );
    expect(await billing()).toMatchObject({ plan: "starter", stripe_price_id: "price_legacy" });
    await send(event("customer.subscription.updated", subscription("active", 2_000_000_000)));
    expect((await billing()).plan).toBe("pro");
  });

  it("ignores events older than the last one applied", async () => {
    const stale = event("customer.subscription.updated", subscription("past_due", 1), created - 3600);
    expect((await send(stale)).status).toBe(200);
    expect((await billing()).subscription_status).toBe("active");
  });

  it("records cancellation scheduling and deletion", async () => {
    await send(
      event(
        "customer.subscription.updated",
        subscription("active", 2_000_000_000, { cancel_at_period_end: true }),
      ),
    );
    expect((await billing()).cancel_at_period_end).toBe(true);
    await send(event("customer.subscription.deleted", subscription("canceled", 2_000_000_000)));
    expect((await billing()).subscription_status).toBe("canceled");
  });

  it("acknowledges events it doesn't handle", async () => {
    const res = await send(event("invoice.paid", { object: "invoice" }));
    expect(res).toEqual({ status: 200, body: { received: true } });
  });
});
