"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { isoToLocalInput, localInputToIso } from "@/lib/datetime";
import { useIsClient } from "@/lib/use-is-client";

/**
 * A datetime-local input whose value is an ISO timestamp (or ""). Conversion
 * uses the browser's time zone, so the server renders it empty and it fills in
 * after hydration.
 */
export function DateTimeInput({
  value,
  onChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (iso: string) => void;
}) {
  const isClient = useIsClient();
  return (
    <Input
      type="datetime-local"
      value={isClient && value ? isoToLocalInput(value) : ""}
      onChange={(e) => onChange(localInputToIso(e.target.value))}
      {...props}
    />
  );
}
