import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed-window rate limit backed by Postgres (public.check_rate_limit).
 * Keys are hashed so raw tokens and IPs aren't stored. Fails open: if the
 * check itself errors, the request is allowed and the error logged.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const hashed = createHash("sha256").update(key).digest("base64url");
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: `${key.split(":")[0]}:${hashed}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] check failed", error);
    return true;
  }
  return data;
}

/** The caller's IP and user agent, as seen through the hosting proxy. */
export async function getRequestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || null;
  return {
    // Only pass something Postgres' inet type will accept.
    ip: ip && /^[0-9a-f.:]+$/i.test(ip) ? ip : null,
    userAgent: h.get("user-agent")?.slice(0, 1000) ?? null,
  };
}
