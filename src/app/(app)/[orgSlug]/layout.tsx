import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { AppSidebarNav } from "@/components/shared/app-sidebar";
import { Logo } from "@/components/shared/logo";
import { OrgSwitcher } from "@/components/shared/org-switcher";
import { UserMenu } from "@/components/shared/user-menu";
import { Separator } from "@/components/ui/separator";
import { getMyOrganizations, requireOrgMembership } from "@/features/organizations/queries";
import { billingEnabled } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export default async function OrgLayout({ children, params }: LayoutProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const { org, user } = await requireOrgMembership(orgSlug);
  const supabase = await createClient();
  const [orgs, { data: profile }] = await Promise.all([
    getMyOrganizations(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b bg-sidebar p-4 md:sticky md:top-0 md:h-svh md:w-64 md:border-r md:border-b-0">
        <Logo href={`/${org.slug}`} className="px-3" />
        <OrgSwitcher current={org} orgs={orgs} />
        <Separator />
        <AppSidebarNav orgSlug={org.slug} showBilling={billingEnabled} />
        <div className="mt-auto">
          <UserMenu name={profile?.full_name ?? null} email={user.email} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 md:px-10">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8">
          {billingEnabled &&
            (org.subscription_status === "past_due" || org.subscription_status === "unpaid") && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
              >
                <AlertTriangle className="size-4 text-destructive" />
                <span className="flex-1">
                  Your last payment failed. Creating episodes and guest links is paused.
                </span>
                <Link
                  href={`/${org.slug}/settings/billing`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Update payment
                </Link>
              </div>
            )}
          {children}
        </div>
      </main>
    </div>
  );
}
