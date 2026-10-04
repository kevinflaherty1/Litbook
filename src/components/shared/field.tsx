import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ControlProps = { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string };

/**
 * Label + control + description/error, wired up for screen readers. Pass the
 * control as the child, or a function that spreads the props onto the element
 * that should get them (e.g. a SelectTrigger inside a Controller).
 */
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
  children: React.ReactElement<Partial<ControlProps>> | ((props: ControlProps) => React.ReactNode);
}) {
  const hintId = description || error ? `${id}-hint` : undefined;
  const controlProps: ControlProps = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": hintId,
  };
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {typeof children === "function" ? children(controlProps) : React.cloneElement(children, controlProps)}
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
