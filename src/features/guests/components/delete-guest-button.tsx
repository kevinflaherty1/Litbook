"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/shared/confirm-button";
import { Button } from "@/components/ui/button";
import { deleteGuest } from "@/features/guests/actions";

export function DeleteGuestButton({
  orgId,
  guestId,
  name,
}: {
  orgId: string;
  guestId: string;
  name: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmButton
      title={`Delete ${name}?`}
      description="This removes them from your directory and from every episode they're booked on, along with anything they submitted, including signed releases. This can't be undone."
      confirmLabel="Delete guest"
      onConfirm={() =>
        startTransition(async () => {
          const result = await deleteGuest({ orgId, guestId });
          if (!result.ok) toast.error(result.error);
        })
      }
    >
      <Button variant="outline" size="sm" disabled={isPending}>
        <Trash2 /> Delete
      </Button>
    </ConfirmButton>
  );
}
