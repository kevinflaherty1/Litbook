import { timingSafeEqual } from "node:crypto";

import { sendDueReminders } from "@/features/bookings/reminders";
import { serverEnv } from "@/lib/env.server";

/** Daily guest reminders. Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = serverEnv.CRON_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await sendDueReminders(), { headers: { "Cache-Control": "no-store" } });
}
