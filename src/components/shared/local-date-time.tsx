"use client";

import { useId } from "react";

import { InlineScript } from "@/components/shared/inline-script";

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * Formats a timestamp in the viewer's locale and time zone without a
 * hydration flash: the server renders its own formatting, and an inline script
 * rewrites it before first paint. On client navigations it renders directly.
 */
export function LocalDateTime({
  value,
  options = DEFAULT_OPTIONS,
  className,
}: {
  value: string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const id = useId();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const args = JSON.stringify([date.toISOString(), options]).replace(/</g, "\\u003c");
  return (
    <>
      <time id={id} dateTime={date.toISOString()} className={className} suppressHydrationWarning>
        {date.toLocaleString(undefined, options)}
      </time>
      <InlineScript
        html={`(function(a){var n=document.getElementById(${JSON.stringify(id)});if(n)n.textContent=new Date(a[0]).toLocaleString(undefined,a[1])})(${args})`}
      />
    </>
  );
}
