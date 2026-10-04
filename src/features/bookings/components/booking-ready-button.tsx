"use client";

import { useTransition } from "react";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setBookingReady } from "@/features/bookings/actions";

export function BookingReadyButton({
  orgId,
  bookingId,
  ready,
}: {
  orgId: string;
  bookingId: string;
  ready: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant={ready ? "outline" : "default"}
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await setBookingReady({ orgId, bookingId, ready: !ready });
          if (!result.ok) toast.error(result.error);
          else
            toast.success(
              ready ? "Reopened: the guest can edit again" : "Marked ready: guest edits are locked",
            );
        })
      }
    >
      {ready ? <LockOpen /> : <Lock />}
      {ready ? "Reopen for edits" : "Mark ready"}
    </Button>
  );
}
