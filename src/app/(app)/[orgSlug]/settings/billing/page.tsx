import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { LocalDateTime } from "@/components/shared/local-date-time";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingButtons } from "@/features/billing/components/billing-buttons";
import { requireOrgMembership } from "@/features/organizations/queries";
import { firstParam } from "@/lib/params";
import { billingEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing" };

const STATUS_LABEL: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  unpaid: "Unpaid",
  canceled: "Cancelled",
  incomplete: "Incomplete",
  incomplete_expired: "Expired",
  paused: "Paused",
};

export default async function BillingPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/settings/billing">) {
  const { orgSlug } = await params;
  const { checkout } = await searchParams;
  const { org, canManage } = await requireOrgMembership(orgSlug);
  const supabase = await createClient();
  const { data: billing, error } = await supabase
    .from("organizations")
    .select("subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id")
    .eq("id", org.id)
    .single();
  if (error) throw error;

  const status = billing.subscription_status;
  const isLive = status === "trialing" || status === "active";
  const needsPayment = status === "past_due" || status === "unpaid";
  const hasSubscription = !!status && status !== "canceled" && status !== "incomplete_expired";

  return (
    <>
      <PageHeader
        title="Billing"
        description="Litbook Pro: $29/month per workspace, unlimited episodes and guests."
      />

      {!billingEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Billing isn&apos;t set up</CardTitle>
            <CardDescription>
              This deployment has no Stripe keys, so every workspace has full access. Set STRIPE_SECRET_KEY,
              STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_ID to turn billing on.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {firstParam(checkout) === "success" && !isLive && (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>Thanks! We&apos;re confirming your subscription with Stripe.</AlertTitle>
              <AlertDescription>
                This usually takes a few seconds. Refresh the page if it doesn&apos;t update.
              </AlertDescription>
            </Alert>
          )}
          {needsPayment && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Your last payment didn&apos;t go through</AlertTitle>
              <AlertDescription>
                Update your payment method to keep creating episodes and guest links. Your data is safe either
                way.
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Litbook Pro
                {status && (
                  <Badge
                    variant={needsPayment ? "destructive" : "secondary"}
                    data-testid="subscription-status"
                  >
                    {STATUS_LABEL[status] ?? status}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {!hasSubscription ? (
                  "Start a free trial to create episodes and send guest links. No card needed to start."
                ) : billing.current_period_end ? (
                  <>
                    {status === "trialing"
                      ? "Trial ends"
                      : billing.cancel_at_period_end
                        ? "Access ends"
                        : "Renews"}{" "}
                    <LocalDateTime value={billing.current_period_end} options={{ dateStyle: "long" }} />.
                    {billing.cancel_at_period_end && " Your subscription won't renew."}
                  </>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {!isLive && (
                <p className="text-sm text-muted-foreground">
                  You can still view, copy and export everything you&apos;ve collected without a subscription.
                </p>
              )}
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {!hasSubscription && <BillingButtons orgId={org.id} mode="checkout" />}
                  {billing.stripe_customer_id && <BillingButtons orgId={org.id} mode="portal" />}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Only owners and admins can manage billing.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
