"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { updateGuestReminders } from "@/features/organizations/actions";

export function GuestRemindersToggle({
  orgId,
  enabled,
  disabled,
}: {
  orgId: string;
  enabled: boolean;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useOptimistic(enabled);

  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-primary"
        checked={checked}
        disabled={disabled || isPending}
        onChange={(e) => {
          const next = e.target.checked;
          startTransition(async () => {
            setChecked(next);
            const result = await updateGuestReminders({ orgId, enabled: next });
            if (result.ok) toast.success(next ? "Guest reminders turned on" : "Guest reminders turned off");
            else toast.error(result.error);
          });
        }}
      />
      <span className="grid gap-1">
        <span className="font-medium">Remind guests who haven&apos;t sent their details</span>
        <span className="text-muted-foreground">
          Up to two reminder emails, three days apart, for links you emailed from Litbook. Each reminder
          contains a fresh link that replaces the previous one.
        </span>
      </span>
    </label>
  );
}
