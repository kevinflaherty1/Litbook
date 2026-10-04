import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + description/error, wired up for screen readers. */
export function Field({
  id,
  label,
  description,
  error,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
}) {
  const hintId = description || error ? `${id}-hint` : undefined;
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": hintId,
      })}
      {error ? (
        <p id={hintId} className="text-sm text-destructive">
          {error}
        </p>
      ) : description ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
