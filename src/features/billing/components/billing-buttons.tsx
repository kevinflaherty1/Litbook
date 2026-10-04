"use client";

import { useTransition } from "react";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { openBillingPortal, startCheckout } from "@/features/billing/actions";

/** Both actions redirect to Stripe on success; errors become toasts. */
export function BillingButtons({ orgId, mode }: { orgId: string; mode: "checkout" | "portal" }) {
  const [isPending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const result =
        mode === "checkout" ? await startCheckout({ orgId }) : await openBillingPortal({ orgId });
      if (!result.ok) toast.error(result.error);
    });

  return (
    <Button
      onClick={run}
      disabled={isPending}
      variant={mode === "checkout" ? "default" : "outline"}
      className="w-fit"
    >
      {isPending ? <Loader2 className="animate-spin" /> : mode === "checkout" ? <Sparkles /> : <CreditCard />}
      {mode === "checkout" ? "Start free trial" : "Manage billing"}
    </Button>
  );
}
