import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookGuestForm } from "@/features/bookings/components/book-guest-form";
import { BookingsTable } from "@/features/bookings/components/bookings-table";
import { DeleteEpisodeButton } from "@/features/episodes/components/delete-episode-button";
import { EpisodeForm } from "@/features/episodes/components/episode-form";
import { EpisodeStatusBadge } from "@/features/episodes/components/episode-status-badge";
import { getEpisode } from "@/features/episodes/queries";
import { getEpisodeSubmissions } from "@/features/bookings/queries";
import { getGuestOptions } from "@/features/guests/queries";
import { requireOrgMembership } from "@/features/organizations/queries";
import { uuidParamOr404 } from "@/lib/params";
import { episodeShowNotes } from "@/lib/show-notes";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: PageProps<"/[orgSlug]/episodes/[episodeId]">): Promise<Metadata> {
  const { orgSlug, episodeId } = await params;
  const { org } = await requireOrgMembership(orgSlug);
  const episode = await getEpisode(org.id, uuidParamOr404(episodeId));
  return { title: episode?.title ?? "Episode" };
}

export default async function EpisodePage({ params }: PageProps<"/[orgSlug]/episodes/[episodeId]">) {
  const { orgSlug, episodeId } = await params;
  const { org, canManage } = await requireOrgMembership(orgSlug);
  const id = uuidParamOr404(episodeId);
  const [episode, guestOptions, submissions] = await Promise.all([
    getEpisode(org.id, id),
    getGuestOptions(org.id),
    getEpisodeSubmissions(org.id, id),
  ]);
  if (!episode) notFound();
  const showNotes = episodeShowNotes(
    episode.title,
    submissions.map((g) => g.assets),
  );

  const bookedIds = new Set(episode.episode_guests.map((b) => b.guests.id));
  const available = guestOptions.filter((g) => !bookedIds.has(g.id));
  const activeCount = episode.episode_guests.filter((b) => b.status !== "cancelled").length;

  return (
    <>
      <div className="grid gap-3">
        <Link
          href={`/${org.slug}/episodes`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Episodes
        </Link>
        <PageHeader
          title={episode.episode_number ? `#${episode.episode_number} ${episode.title}` : episode.title}
          description={<EpisodeStatusBadge status={episode.status} />}
          actions={
            canManage && <DeleteEpisodeButton orgId={org.id} episodeId={episode.id} title={episode.title} />
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Guests</CardTitle>
          <CardDescription>
            {activeCount
              ? `${activeCount} booked. Get each guest's link and send it to them to collect their bio, headshot and signed release.`
              : "Book a guest, then send them their onboarding link."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <BookingsTable orgId={org.id} orgSlug={org.slug} bookings={episode.episode_guests} />
          <div className="border-t pt-6">
            <BookGuestForm orgId={org.id} episodeId={episode.id} guests={available} />
          </div>
        </CardContent>
      </Card>

      {submissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Show notes and export</CardTitle>
            <CardDescription>
              From {submissions.length} {submissions.length === 1 ? "guest" : "guests"} who sent their
              details.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <pre
              className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-4 font-sans text-sm whitespace-pre-wrap"
              data-testid="show-notes"
            >
              {showNotes}
            </pre>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={showNotes} label="Copy show notes" />
              <Button asChild variant="outline" size="sm">
                <a href={`/${org.slug}/episodes/${episode.id}/export`}>
                  <Download /> Download headshots + guests.md (ZIP)
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <EpisodeForm orgId={org.id} episode={episode} />
        </CardContent>
      </Card>
    </>
  );
}
