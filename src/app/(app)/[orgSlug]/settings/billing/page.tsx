import type { Metadata } from "next";
import { AlertTriangle, Check, CheckCircle2 } from "lucide-react";

import { LocalDateTime } from "@/components/shared/local-date-time";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingButtons } from "@/features/billing/components/billing-buttons";
import { requireOrgMembership } from "@/features/organizations/queries";
import { firstParam } from "@/lib/params";
import { PLAN_KEYS, PLANS } from "@/lib/plans";
import { billingEnabled, offeredPlans } from "@/lib/stripe";
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
  const [{ data: billing, error }, { data: usageRaw, error: usageError }] = await Promise.all([
    supabase
      .from("organizations")
      .select("subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id, plan")
      .eq("id", org.id)
      .single(),
    supabase.rpc("org_plan_usage", { p_org: org.id }),
  ]);
  if (error) throw error;
  if (usageError) throw usageError;
  const usage = usageRaw as {
    seats: number | null;
    episodes_per_month: number | null;
    members: number;
    pending_invites: number;
    episodes_this_month: number;
  };

  const status = billing.subscription_status;
  const isLive = status === "trialing" || status === "active";
  const needsPayment = status === "past_due" || status === "unpaid";
  const hasSubscription = !!status && status !== "canceled" && status !== "incomplete_expired";
  const currentPlan = billing.plan === "starter" || billing.plan === "pro" ? billing.plan : null;
  const plans = billingEnabled ? offeredPlans() : PLAN_KEYS;

  return (
    <>
      <PageHeader
        title="Billing"
        description="One subscription per workspace. Every plan starts with a free trial."
      />

      {!billingEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Billing isn&apos;t set up</CardTitle>
            <CardDescription>
              This deployment has no Stripe keys, so every workspace has full access with no limits. Set
              STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_PRO (and optionally
              STRIPE_PRICE_STARTER) to turn billing on.
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
                {currentPlan && hasSubscription ? `Litbook ${PLANS[currentPlan].name}` : "No subscription"}
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
            <CardContent className="grid gap-4">
              {!isLive && (
                <p className="text-sm text-muted-foreground">
                  You can still view, copy and export everything you&apos;ve collected without a subscription.
                </p>
              )}
              {canManage ? (
                billing.stripe_customer_id && <BillingButtons orgId={org.id} mode="portal" />
              ) : (
                <p className="text-sm text-muted-foreground">Only owners and admins can manage billing.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2" data-testid="plan-usage">
            <UsageItem
              label="Team members"
              used={usage.members + usage.pending_invites}
              limit={usage.seats}
              note={
                usage.pending_invites ? `Includes ${usage.pending_invites} pending invitation(s).` : undefined
              }
            />
            <UsageItem
              label="New episodes this month"
              used={usage.episodes_this_month}
              limit={usage.episodes_per_month}
            />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((key) => {
          const plan = PLANS[key];
          const isCurrent = hasSubscription && currentPlan === key;
          return (
            <Card key={key} className={isCurrent ? "border-primary" : undefined} data-testid={`plan-${key}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {plan.name}
                  {isCurrent && <Badge>Current plan</Badge>}
                </CardTitle>
                <CardDescription className="text-lg font-semibold text-foreground">
                  {plan.price}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ul className="grid gap-1.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {f}
                    </li>
                  ))}
                </ul>
                {billingEnabled &&
                  canManage &&
                  !isCurrent &&
                  (hasSubscription ? (
                    <p className="text-sm text-muted-foreground">
                      Switch plans from Manage billing. Changes are prorated.
                    </p>
                  ) : (
                    <BillingButtons orgId={org.id} mode="checkout" plan={key} />
                  ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function UsageItem({
  label,
  used,
  limit,
  note,
}: {
  label: string;
  used: number;
  limit: number | null;
  note?: string;
}) {
  const full = limit !== null && used >= limit;
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">
        {used}
        <span className="text-sm font-normal text-muted-foreground"> / {limit ?? "unlimited"}</span>
        {full && (
          <Badge variant="secondary" className="ml-2 align-middle">
            Limit reached
          </Badge>
        )}
      </dd>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
