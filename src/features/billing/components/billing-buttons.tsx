"use client";

import { useTransition } from "react";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { openBillingPortal, startCheckout } from "@/features/billing/actions";
import { PLANS, type Plan } from "@/lib/plans";

/** Both actions redirect to Stripe on success; errors become toasts. */
export function BillingButtons({
  orgId,
  mode,
  plan = "pro",
}: {
  orgId: string;
  mode: "checkout" | "portal";
  plan?: Plan;
}) {
  const [isPending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const result =
        mode === "checkout" ? await startCheckout({ orgId, plan }) : await openBillingPortal({ orgId });
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
      {mode === "checkout" ? `Start ${PLANS[plan].name} trial` : "Manage billing"}
    </Button>
  );
}
