import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookGuestForm } from "@/features/bookings/components/book-guest-form";
import { BookingsTable } from "@/features/bookings/components/bookings-table";
import { DeleteEpisodeButton } from "@/features/episodes/components/delete-episode-button";
import { EpisodeForm } from "@/features/episodes/components/episode-form";
import { EpisodeStatusBadge } from "@/features/episodes/components/episode-status-badge";
import { getEpisode } from "@/features/episodes/queries";
import { getGuestOptions } from "@/features/guests/queries";
import { requireOrgMembership } from "@/features/organizations/queries";
import { uuidParamOr404 } from "@/lib/params";

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
  const [episode, guestOptions] = await Promise.all([getEpisode(org.id, id), getGuestOptions(org.id)]);
  if (!episode) notFound();

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
