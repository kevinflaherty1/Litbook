import type { Instrumentation } from "next";

import { redactPath } from "@/lib/redact";

/**
 * Logs every server error as one JSON line, which log drains (Vercel, Datadog,
 * Axiom…) can parse and alert on. Portal and invite tokens are redacted.
 * To use Sentry instead, add @sentry/nextjs and call captureRequestError here.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      level: "error",
      source: "next",
      message: err.message,
      digest: (error as { digest?: string }).digest,
      stack: err.stack?.split("\n").slice(0, 8).join("\n"),
      method: request.method,
      path: redactPath(request.path),
      route: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    }),
  );
};
