import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Mic, Plus } from "lucide-react";

import { LocalDateTime } from "@/components/shared/local-date-time";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bookingSummary } from "@/features/bookings/components/booking-status-badge";
import { EpisodeStatusBadge } from "@/features/episodes/components/episode-status-badge";
import { EpisodeStatusFilter } from "@/features/episodes/components/episode-status-filter";
import { listEpisodes } from "@/features/episodes/queries";
import { requireOrgMembership } from "@/features/organizations/queries";
import { firstParam } from "@/lib/params";
import { EPISODE_STATUS_LABEL, episodeListFilterSchema } from "@/schemas/episode";

export const metadata: Metadata = { title: "Episodes" };

export default async function EpisodesPage({ params, searchParams }: PageProps<"/[orgSlug]/episodes">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireOrgMembership(orgSlug);
  const filter = episodeListFilterSchema.parse({ status: firstParam(sp.status), page: firstParam(sp.page) });
  const { episodes, total, pageSize } = await listEpisodes(org.id, filter);
  const basePath = `/${org.slug}/episodes`;

  return (
    <>
      <PageHeader
        title="Episodes"
        description="Plan recordings and book guests onto them."
        actions={
          <Button asChild>
            <Link href={`${basePath}/new`}>
              <Plus /> New episode
            </Link>
          </Button>
        }
      />

      <EpisodeStatusFilter basePath={basePath} current={filter.status} />

      {episodes.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-10 text-center">
            <Mic className="size-8 text-muted-foreground" />
            <p className="font-medium">
              {filter.status
                ? `No ${EPISODE_STATUS_LABEL[filter.status].toLowerCase()} episodes`
                : "No episodes yet"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create an episode, then book guests onto it and send each one their onboarding link.
            </p>
            {!filter.status && (
              <Button asChild variant="outline" size="sm">
                <Link href={`${basePath}/new`}>Create your first episode</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Episode</TableHead>
                <TableHead className="hidden md:table-cell">Recording</TableHead>
                <TableHead className="hidden sm:table-cell">Guests</TableHead>
                <TableHead className="pr-6 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {episodes.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="pl-6 whitespace-normal">
                    <Link href={`${basePath}/${e.id}`} className="font-medium hover:underline">
                      {e.episode_number && (
                        <span className="text-muted-foreground">#{e.episode_number} </span>
                      )}
                      {e.title}
                    </Link>
                    <p className="text-xs text-muted-foreground md:hidden">
                      {e.recording_at ? <LocalDateTime value={e.recording_at} /> : "Not scheduled"}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {e.recording_at ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="size-4 text-muted-foreground" />
                        <LocalDateTime value={e.recording_at} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not scheduled</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {bookingSummary(e.episode_guests)}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <EpisodeStatusBadge status={e.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Pagination
        basePath={basePath}
        searchParams={{ status: filter.status }}
        page={filter.page}
        pageSize={pageSize}
        total={total}
      />
    </>
  );
}
