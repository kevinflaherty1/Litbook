const FALLBACK = "/dashboard";

/**
 * Returns `next` only if it's a same-origin path, so `?next=` can't be used
 * as an open redirect. Absolute URLs are accepted only when their origin
 * matches `origin` (Supabase email links pass the full redirect URL).
 */
export function safeNextPath(next: string | null | undefined, origin?: string): string {
  if (!next) return FALLBACK;

  if (origin && /^https?:\/\//i.test(next)) {
    try {
      const url = new URL(next);
      if (url.origin !== new URL(origin).origin) return FALLBACK;
      next = `${url.pathname}${url.search}`;
    } catch {
      return FALLBACK;
    }
  }

  // Must be a path; reject protocol-relative ("//evil.com") and backslash
  // tricks ("/\evil.com") that browsers treat as another host.
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return FALLBACK;
  }
  return next;
}
