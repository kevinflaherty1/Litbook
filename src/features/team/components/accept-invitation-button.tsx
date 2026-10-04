"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/features/team/actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      className="w-full"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          // Redirects into the workspace on success.
          const result = await acceptInvitation({ token });
          if (!result.ok) toast.error(result.error);
        })
      }
    >
      {isPending && <Loader2 className="animate-spin" />}
      Accept invitation
    </Button>
  );
}
