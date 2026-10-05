import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { LocalDateTime } from "@/components/shared/local-date-time";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status-badge";
import { DeleteGuestButton } from "@/features/guests/components/delete-guest-button";
import { GuestForm } from "@/features/guests/components/guest-form";
import { getGuest } from "@/features/guests/queries";
import { requireOrgMembership } from "@/features/organizations/queries";
import { uuidParamOr404 } from "@/lib/params";

export async function generateMetadata({
  params,
}: PageProps<"/[orgSlug]/guests/[guestId]">): Promise<Metadata> {
  const { orgSlug, guestId } = await params;
  const { org } = await requireOrgMembership(orgSlug);
  const guest = await getGuest(org.id, uuidParamOr404(guestId));
  return { title: guest?.full_name ?? "Guest" };
}

export default async function GuestPage({ params }: PageProps<"/[orgSlug]/guests/[guestId]">) {
  const { orgSlug, guestId } = await params;
  const { org, canManage } = await requireOrgMembership(orgSlug);
  const guest = await getGuest(org.id, uuidParamOr404(guestId));
  if (!guest) notFound();

  return (
    <>
      <div className="grid gap-3">
        <Link
          href={`/${org.slug}/guests`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Guests
        </Link>
        <PageHeader
          title={guest.full_name}
          description={guest.email ?? undefined}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`/${org.slug}/guests/${guest.id}/export`} title="Everything held about this guest">
                  <Download /> Export data
                </a>
              </Button>
              {canManage && <DeleteGuestButton orgId={org.id} guestId={guest.id} name={guest.full_name} />}
            </div>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Episodes</CardTitle>
          <CardDescription>
            {guest.episode_guests.length
              ? "Open an episode to manage this guest's onboarding link."
              : "Not booked on any episodes yet. Book them from an episode page."}
          </CardDescription>
        </CardHeader>
        {guest.episode_guests.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Episode</TableHead>
                  <TableHead className="hidden sm:table-cell">Recording</TableHead>
                  <TableHead className="text-right">Onboarding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guest.episode_guests.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-normal">
                      <Link
                        href={`/${org.slug}/episodes/${b.episodes.id}`}
                        className="font-medium hover:underline"
                      >
                        {b.episodes.episode_number && (
                          <span className="text-muted-foreground">#{b.episodes.episode_number} </span>
                        )}
                        {b.episodes.title}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {b.episodes.recording_at ? (
                        <LocalDateTime value={b.episodes.recording_at} />
                      ) : (
                        <span className="text-muted-foreground">Not scheduled</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/${org.slug}/bookings/${b.id}`}
                        aria-label={`View ${b.episodes.title} booking`}
                      >
                        <BookingStatusBadge status={b.status} />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <GuestForm orgId={org.id} guest={guest} />
        </CardContent>
      </Card>
    </>
  );
}
