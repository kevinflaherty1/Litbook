import Link from "next/link";
import { CheckCircle2, Circle, FileSignature, Mic, Users } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMembership } from "@/features/organizations/queries";
import { getMembers } from "@/features/team/queries";

export default async function OrgOverviewPage({ params }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const { org } = await requireOrgMembership(orgSlug);
  const members = await getMembers(org.id);

  const steps = [
    {
      done: true,
      icon: Mic,
      title: "Create your workspace",
      description: `${org.name} is ready.`,
    },
    {
      done: members.length > 1,
      icon: Users,
      title: "Invite your team",
      description: "Producers and co-hosts can manage guests with you.",
      href: `/${org.slug}/settings/team`,
      cta: "Invite teammates",
    },
    {
      done: org.release_form_version > 1,
      icon: FileSignature,
      title: "Review your release form",
      description: "Guests sign this before recording. Use our default or paste your own.",
      href: `/${org.slug}/settings#release-form`,
      cta: "Edit release form",
    },
  ];

  return (
    <>
      <PageHeader title={`Welcome to ${org.name}`} description="Here's how to get set up." />
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            Episodes and guest onboarding links are coming next. Finish setting up your workspace in the
            meantime.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {steps.map((step) => (
            <div key={step.title} className="flex items-start gap-3 rounded-lg border p-4">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-label="Done" />
              ) : (
                <Circle className="mt-0.5 size-5 text-muted-foreground" aria-label="To do" />
              )}
              <div className="grid flex-1 gap-1">
                <p className="font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
              {!step.done && step.href && (
                <Button asChild variant="outline" size="sm">
                  <Link href={step.href}>{step.cta}</Link>
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
