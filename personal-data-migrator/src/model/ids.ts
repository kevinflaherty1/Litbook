import { createHash } from "node:crypto";
import type { Platform } from "./types.ts";

/**
 * Deterministic local id. Importing the same export twice yields the same ids,
 * which keeps transformer output and any downstream bookkeeping stable.
 * Uses the platform's own id when there is one, otherwise a hash of fields
 * that identify the record (Instagram exports have no post ids).
 */
export function localId(
  platform: Platform,
  kind: "post" | "comment",
  ...parts: (string | number | undefined)[]
): string {
  const key = parts.filter((p) => p !== undefined && p !== "").join("|");
  const short = /^[\w-]{1,40}$/.test(key) ? key : createHash("sha256").update(key).digest("hex").slice(0, 16);
  return `${platform}:${kind}:${short}`;
}
