import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.CRON_SECRET = "cron-secret-for-integration-tests";
const { GET } = await import("@/app/api/cron/reminders/route");

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

const orgId = randomUUID();
const bookingId = randomUUID();
const guestEmail = `reminder-${randomUUID().slice(0, 8)}@example.com`;
const originalToken = randomBytes(32).toString("base64url");

async function context(token: string) {
  const { data, error } = await admin.rpc("get_onboarding_context", { p_token: token });
  if (error) throw error;
  return data;
}

async function inbox() {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${guestEmail}"`)}`);
  const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
  return messages ?? [];
}

function cron(auth?: string) {
  return GET(
    new Request("http://localhost/api/cron/reminders", { headers: auth ? { authorization: auth } : {} }),
  );
}

beforeAll(async () => {
  const episodeId = randomUUID();
  const guestId = randomUUID();
  const steps = [
    admin
      .from("organizations")
      .insert({ id: orgId, name: "Reminder Radio", slug: `rr-${orgId.slice(0, 8)}` }),
    admin.from("episodes").insert({ id: episodeId, organization_id: orgId, title: "On Chasing" }),
    admin
      .from("guests")
      .insert({ id: guestId, organization_id: orgId, full_name: "Rita Reminded", email: guestEmail }),
    admin
      .from("episode_guests")
      .insert({ id: bookingId, organization_id: orgId, episode_id: episodeId, guest_id: guestId }),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw error;
  }
  const { error } = await admin.rpc("set_onboarding_token", {
    p_episode_guest_id: bookingId,
    p_token: originalToken,
  });
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("organizations").delete().eq("id", orgId);
});

describe("GET /api/cron/reminders", () => {
  it("requires the cron secret", async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer wrong-secret-of-the-same-size!")).status).toBe(401);
  });

  it("leaves links that weren't emailed by Litbook alone", async () => {
    await admin.from("episode_guests").update({ link_emailed_at: null }).eq("id", bookingId);
    await cron("Bearer cron-secret-for-integration-tests");
    expect(await inbox()).toHaveLength(0);
    expect(await context(originalToken)).not.toBeNull();
  });

  it("emails a fresh link to guests who haven't submitted, then waits", async () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86400_000).toISOString();
    await admin.from("episode_guests").update({ link_emailed_at: fourDaysAgo }).eq("id", bookingId);

    const res = await cron("Bearer cron-secret-for-integration-tests");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { sent: number }).sent).toBeGreaterThanOrEqual(1);

    const messages = await inbox();
    expect(messages).toHaveLength(1);
    expect(messages[0].Subject).toBe("Reminder: your guest details for Reminder Radio");
    const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as {
      Text: string;
    };
    const token = msg.Text.match(/\/submit\/([\w-]{43})/)?.[1];
    expect(token).toBeDefined();

    // The new link works and replaced the old one.
    expect(await context(token!)).toMatchObject({ guest: { full_name: "Rita Reminded" } });
    expect(await context(originalToken)).toBeNull();
    const { data } = await admin.from("episode_guests").select("reminder_count").eq("id", bookingId).single();
    expect(data?.reminder_count).toBe(1);

    // Nothing more until the gap has passed.
    await cron("Bearer cron-secret-for-integration-tests");
    expect(await inbox()).toHaveLength(1);
  });
});
