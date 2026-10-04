"use client";

import { useNonce } from "@/components/shared/nonce-provider";

/**
 * A <script> that runs during HTML parsing on full page loads, before React
 * hydrates. It carries the CSP nonce. On the client it renders inert, which
 * avoids React's dev warning (browsers also hide nonce values from the DOM).
 */
export function InlineScript({ html }: { html: string }) {
  const nonce = useNonce();
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      nonce={typeof window === "undefined" ? nonce : undefined}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
