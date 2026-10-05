import { notFound } from "next/navigation";
import { after } from "next/server";
import { CalendarClock, Lock } from "lucide-react";

import { LocalDateTime } from "@/components/shared/local-date-time";
import { SchedulePicker } from "@/features/portal/components/schedule-picker";
import { logoPublicUrl } from "@/lib/branding";
import { googleCalendarUrl, recordingEvent } from "@/lib/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OnboardingForm } from "@/features/portal/components/onboarding-form";
import {
  getHeadshotPreviewUrl,
  getOnboardingContext,
  recordOnboardingVisit,
} from "@/features/portal/queries";

export default async function GuestPortalPage({ params }: PageProps<"/submit/[token]">) {
  const { token } = await params;
  const ctx = await getOnboardingContext(token);
  if (!ctx) notFound();

  after(() => recordOnboardingVisit(token));
  const headshotPreviewUrl = await getHeadshotPreviewUrl(ctx.submission?.headshot_path);
  const firstName = ctx.guest.full_name.split(" ")[0];
  const logoUrl = logoPublicUrl(ctx.organization.logo_path);
  const mySlot = ctx.slots.find((s) => s.mine);
  const calendarUrl = mySlot
    ? googleCalendarUrl(
        recordingEvent({
          bookingId: ctx.episode_guest_id,
          start: mySlot.starts_at,
          durationMinutes: mySlot.duration_minutes,
          organizationName: ctx.organization.name,
          episodeTitle: ctx.episode.title,
          meetingUrl: ctx.episode.meeting_url,
        }),
      )
    : null;

  return (
    <>
      <header className="grid gap-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public Storage URL
          <img
            src={logoUrl}
            alt={`${ctx.organization.name} logo`}
            className="mb-2 h-12 w-fit max-w-48 object-contain"
          />
        )}
        <p className="text-sm font-medium text-muted-foreground">{ctx.organization.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {ctx.is_locked ? `Thanks, ${firstName}!` : `Hi ${firstName}, welcome to the show`}
        </h1>
        <p className="text-muted-foreground">
          You&apos;re booked on <span className="font-medium text-foreground">{ctx.episode.title}</span>.
          {!ctx.is_locked &&
            " Share a few details so we can introduce you properly. It takes about five minutes."}
        </p>
        {ctx.episode.recording_at && !ctx.slots.length && (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" /> Recording <LocalDateTime value={ctx.episode.recording_at} />
          </p>
        )}
        {ctx.organization.portal_welcome && !ctx.is_locked && (
          <p className="rounded-md border bg-background p-4 text-sm whitespace-pre-wrap">
            {ctx.organization.portal_welcome}
          </p>
        )}
      </header>

      {ctx.slots.length > 0 && (
        <SchedulePicker
          token={token}
          slots={ctx.slots}
          meetingUrl={ctx.episode.meeting_url}
          googleCalendarUrl={calendarUrl}
        />
      )}

      {ctx.is_locked ? (
        <Alert>
          <Lock />
          <AlertTitle>Your details are finalized</AlertTitle>
          <AlertDescription>
            {ctx.organization.name} has everything they need. If something needs to change, reply to your host
            directly.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {ctx.submission?.release_signed_at && (
            <Alert>
              <AlertTitle>You&apos;ve already sent your details</AlertTitle>
              <AlertDescription>
                You can update them below until your host finalizes them. You&apos;ll need to sign the release
                again when you save.
              </AlertDescription>
            </Alert>
          )}
          <OnboardingForm
            token={token}
            guestName={ctx.guest.full_name}
            releaseText={ctx.release.text}
            existing={ctx.submission}
            headshotPreviewUrl={headshotPreviewUrl}
            customFields={ctx.custom_fields}
            requestedAssets={ctx.organization.requested_assets}
            existingAssets={ctx.assets}
          />
        </>
      )}
    </>
  );
}
