import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, FileSignature, ImageOff, Paperclip } from "lucide-react";

import { CopyButton } from "@/components/shared/copy-button";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingReadyButton } from "@/features/bookings/components/booking-ready-button";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status-badge";
import { CopyableText } from "@/features/bookings/components/copyable-text";
import { SubmissionContentForm } from "@/features/bookings/components/submission-content-form";
import { getBooking, getBookingAssets, getGuestFileUrl, toGuestAssets } from "@/features/bookings/queries";
import { answeredQuestions, listCustomFields } from "@/features/custom-fields/queries";
import { requireOrgMembership } from "@/features/organizations/queries";
import { uuidParamOr404 } from "@/lib/params";
import { guestShowNotes } from "@/lib/show-notes";
import { socialEntries } from "@/lib/social";
import { ASSET_SPECS, formatBytes } from "@/schemas/assets";

export async function generateMetadata({
  params,
}: PageProps<"/[orgSlug]/bookings/[bookingId]">): Promise<Metadata> {
  const { orgSlug, bookingId } = await params;
  const { org } = await requireOrgMembership(orgSlug);
  const booking = await getBooking(org.id, uuidParamOr404(bookingId));
  return { title: booking ? `${booking.guests.full_name} · ${booking.episodes.title}` : "Guest" };
}

export default async function BookingPage({ params }: PageProps<"/[orgSlug]/bookings/[bookingId]">) {
  const { orgSlug, bookingId } = await params;
  const { org } = await requireOrgMembership(orgSlug);
  const booking = await getBooking(org.id, uuidParamOr404(bookingId));
  if (!booking) notFound();

  const s = booking.submission;
  const base = `/${org.slug}/bookings/${booking.id}`;
  const episodeHref = `/${org.slug}/episodes/${booking.episodes.id}`;
  const [headshotUrl, customFields, files] = await Promise.all([
    getGuestFileUrl(s?.headshot_path ?? null),
    listCustomFields(org.id),
    getBookingAssets(org.id, booking.id),
  ]);
  // Previews for images and audio; everything else is a download.
  const previews = await Promise.all(
    files.map((f) =>
      f.content_type.startsWith("image/") || f.content_type.startsWith("audio/")
        ? getGuestFileUrl(f.path, { expiresIn: 600 })
        : null,
    ),
  );
  const answers = s ? answeredQuestions(customFields, s.custom_answers) : [];
  const assets = s ? toGuestAssets(booking.guests.full_name, s) : null;
  const socials = assets ? socialEntries(assets.socialLinks) : [];

  return (
    <>
      <div className="grid gap-3">
        <Link
          href={episodeHref}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {booking.episodes.title}
        </Link>
        <PageHeader
          title={assets?.name ?? booking.guests.full_name}
          description={<BookingStatusBadge status={booking.status} />}
          actions={
            s &&
            booking.status !== "cancelled" && (
              <div className="flex flex-wrap gap-2">
                {assets && <CopyButton value={guestShowNotes(assets)} label="Copy show notes" />}
                <BookingReadyButton
                  orgId={org.id}
                  bookingId={booking.id}
                  ready={booking.status === "ready"}
                />
              </div>
            )
          }
        />
      </div>

      {!s || !assets ? (
        <Card>
          <CardContent className="grid gap-2 py-8 text-center">
            <p className="font-medium">Waiting on {booking.guests.full_name}</p>
            <p className="text-sm text-muted-foreground">
              Their bio, headshot and signed release will show up here once they use their onboarding link.
            </p>
            <Button asChild variant="outline" size="sm" className="mx-auto mt-2">
              <Link href={episodeHref}>Get their link</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Assets</CardTitle>
              <CardDescription>
                Submitted <LocalDateTime value={booking.submitted_at ?? s.updated_at} />
                {booking.status === "ready"
                  ? ". Locked: the guest can no longer edit."
                  : ". The guest can still edit until you mark it ready."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-[12rem_1fr]">
              <div className="grid content-start gap-3">
                {headshotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img
                    src={headshotUrl}
                    alt={`Headshot of ${assets.name}`}
                    className="aspect-square w-full max-w-48 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full max-w-48 items-center justify-center rounded-lg border bg-muted">
                    <ImageOff className="size-8 text-muted-foreground" />
                  </div>
                )}
                {s.headshot_path && (
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <a href={`${base}/headshot`}>
                      <Download /> Download headshot
                    </a>
                  </Button>
                )}
              </div>
              <div className="grid min-w-0 content-start gap-5">
                <CopyableText label="Headline" value={assets.headline} />
                <CopyableText label="Short bio" value={assets.shortBio} multiline />
                <CopyableText label="Long bio" value={assets.longBio} multiline />
                <div className="grid gap-4 sm:grid-cols-2">
                  <CopyableText label="Pronouns" value={s.pronouns} />
                  <CopyableText label="Pronunciation" value={s.name_pronunciation} />
                </div>
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium">Links</span>
                  {assets.websiteUrl || socials.length ? (
                    <ul className="grid gap-1 text-sm">
                      {assets.websiteUrl && (
                        <li>
                          <ExternalAnchor href={assets.websiteUrl}>{assets.websiteUrl}</ExternalAnchor>
                        </li>
                      )}
                      {socials.map((link) => (
                        <li key={link.key} className="break-all">
                          <span className="text-muted-foreground">{link.label}: </span>
                          {link.url ? (
                            <ExternalAnchor href={link.url}>{link.value}</ExternalAnchor>
                          ) : (
                            link.value
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not provided</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {files.length > 0 && (
            <Card id="files">
              <CardHeader>
                <CardTitle>Files</CardTitle>
                <CardDescription>Extra files {booking.guests.full_name} uploaded.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {files.map((f, i) => (
                  <div key={f.kind} className="grid gap-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Paperclip className="size-4 text-muted-foreground" />
                      <span className="font-medium">{ASSET_SPECS[f.kind].label}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {f.file_name} · {formatBytes(f.size_bytes)}
                      </span>
                      <Button asChild variant="outline" size="sm">
                        <a href={`${base}/files/${f.kind}`}>
                          <Download /> Download {ASSET_SPECS[f.kind].label.toLowerCase()}
                        </a>
                      </Button>
                    </div>
                    {previews[i] && f.content_type.startsWith("image/") && (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                      <img
                        src={previews[i]}
                        alt={`${ASSET_SPECS[f.kind].label} from ${assets.name}`}
                        className="max-h-32 w-fit max-w-full rounded border bg-muted object-contain"
                      />
                    )}
                    {previews[i] && f.content_type.startsWith("audio/") && (
                      <audio controls preload="none" src={previews[i]} className="w-full">
                        <track kind="captions" />
                      </audio>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {answers.length > 0 && (
            <Card id="answers">
              <CardHeader>
                <CardTitle>Answers</CardTitle>
                <CardDescription>Their answers to your guest questions.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                {answers.map((a) => (
                  <CopyableText
                    key={a.id}
                    label={a.archived ? `${a.label} (archived question)` : a.label}
                    value={a.answer}
                    multiline
                  />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Fix typos</CardTitle>
              <CardDescription>
                Edit what {booking.guests.full_name} sent. Their signed release stays as signed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SubmissionContentForm orgId={org.id} bookingId={booking.id} content={s} />
            </CardContent>
          </Card>

          {s.release_signed_at && (
            <Card id="release">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSignature className="size-5" /> Signed release
                </CardTitle>
                <CardDescription>
                  Signed by <span className="font-medium text-foreground">{s.release_signed_name}</span> on{" "}
                  <LocalDateTime value={s.release_signed_at} /> (version {s.release_version}).
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
                  {s.release_text_snapshot}
                </div>
                <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-[8rem_1fr]">
                  <dt>IP address</dt>
                  <dd className="break-all">{String(s.release_ip ?? "Not recorded")}</dd>
                  <dt>Browser</dt>
                  <dd className="break-all">{s.release_user_agent ?? "Not recorded"}</dd>
                </dl>
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <a href={`${base}/release`}>
                    <Download /> Download PDF
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function ExternalAnchor({ href, children }: { href: string; children: React.ReactNode }) {
  // Only http(s) links are clickable, whatever ended up in the database.
  if (!/^https?:\/\//i.test(href)) return <span className="break-all">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 break-all text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}
