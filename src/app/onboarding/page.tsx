import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateOrganizationForm } from "@/features/organizations/components/create-organization-form";
import { getMyOrganizations } from "@/features/organizations/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function OnboardingPage() {
  await requireUser("/onboarding");
  const orgs = await getMyOrganizations();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <Logo href="/dashboard" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>{orgs.length ? "Create another workspace" : "Create your workspace"}</h1>
          </CardTitle>
          <CardDescription>
            A workspace holds your episodes, guests and team. You can invite teammates next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm />
        </CardContent>
      </Card>
      {orgs.length > 0 && (
        <Link href={`/${orgs[0].slug}`} className="text-sm text-muted-foreground hover:underline">
          Back to {orgs[0].name}
        </Link>
      )}
    </div>
  );
}
