import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  FileSignature,
  Link2,
  Mic,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";

import { LocalDateTime } from "@/components/shared/local-date-time";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBookingCounts, getEpisodeCount, getUpcomingRecordings } from "@/features/episodes/queries";
import { requireOrgMembership } from "@/features/organizations/queries";
import { getMembers } from "@/features/team/queries";

export default async function OrgOverviewPage({ params }: PageProps<"/[orgSlug]">) {
  const { orgSlug } = await params;
  const { org } = await requireOrgMembership(orgSlug);
  const [members, episodeCount, counts, upcoming] = await Promise.all([
    getMembers(org.id),
    getEpisodeCount(org.id),
    getBookingCounts(org.id),
    getUpcomingRecordings(org.id),
  ]);
  const base = `/${org.slug}`;
  const bookingCount = counts.pending + counts.submitted + counts.ready;

  const steps = [
    {
      done: episodeCount > 0,
      icon: Mic,
      title: "Create your first episode",
      description: "Add a title and recording date.",
      href: `${base}/episodes/new`,
      cta: "New episode",
    },
    {
      done: bookingCount > 0,
      icon: UserPlus,
      title: "Book a guest and send their link",
      description: "They'll send back their bio, headshot and signed release.",
      href: `${base}/episodes`,
      cta: "Go to episodes",
    },
    {
      done: members.length > 1,
      icon: Users,
      title: "Invite your team",
      description: "Producers and co-hosts can manage guests with you.",
      href: `${base}/settings/team`,
      cta: "Invite teammates",
    },
    {
      done: org.release_form_version > 1,
      icon: FileSignature,
      title: "Review your release form",
      description: "Guests sign this before recording. Use our default or paste your own.",
      href: `${base}/settings#release-form`,
      cta: "Edit release form",
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  const stats = [
    { label: "Waiting on guest", value: counts.pending, hint: `${counts.noLink} without a link yet` },
    { label: "Submitted", value: counts.submitted, hint: "Ready for your review" },
    { label: "Ready", value: counts.ready, hint: "Approved and locked" },
  ];

  return (
    <>
      <PageHeader
        title={org.name}
        description="Upcoming recordings and where each guest is."
        actions={
          <Button asChild>
            <Link href={`${base}/episodes/new`}>
              <Plus /> New episode
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="gap-2">
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums" data-testid={`stat-${s.label}`}>
                {s.value}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{s.hint}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming recordings</CardTitle>
          <CardDescription>Draft and scheduled episodes with a recording date ahead.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing scheduled. Give an episode a recording date and it shows up here.
            </p>
          ) : (
            <ul className="grid gap-2">
              {upcoming.map((e) => {
                const active = e.episode_guests.filter((b) => b.status !== "cancelled");
                const waiting = active.filter((b) => b.status === "pending").length;
                return (
                  <li key={e.id}>
                    <Link
                      href={`${base}/episodes/${e.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border p-3 transition-colors hover:bg-accent"
                    >
                      <span className="inline-flex min-w-40 items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarClock className="size-4" />
                        <LocalDateTime value={e.recording_at!} />
                      </span>
                      <span className="min-w-0 flex-1 font-medium">{e.title}</span>
                      <span className="text-sm text-muted-foreground">
                        {active.length ? active.map((b) => b.guests.full_name).join(", ") : "No guests yet"}
                      </span>
                      {waiting > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                          <Link2 className="size-3" /> {waiting} waiting
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {remaining > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Getting started</CardTitle>
            <CardDescription>
              {remaining} {remaining === 1 ? "step" : "steps"} left to set up {org.name}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {steps.map((step) => (
              <div key={step.title} className="flex flex-wrap items-start gap-3 rounded-lg border p-4">
                {step.done ? (
                  <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-label="Done" />
                ) : (
                  <Circle className="mt-0.5 size-5 text-muted-foreground" aria-label="To do" />
                )}
                <div className="grid min-w-48 flex-1 gap-1">
                  <p className="font-medium">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
                {!step.done && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={step.href}>{step.cta}</Link>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
