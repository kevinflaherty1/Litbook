import { notFound } from "next/navigation";
import { after } from "next/server";
import { CalendarClock, Lock } from "lucide-react";

import { LocalDateTime } from "@/components/shared/local-date-time";
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

  return (
    <>
      <header className="grid gap-2">
        <p className="text-sm font-medium text-muted-foreground">{ctx.organization.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {ctx.is_locked ? `Thanks, ${firstName}!` : `Hi ${firstName}, welcome to the show`}
        </h1>
        <p className="text-muted-foreground">
          You&apos;re booked on <span className="font-medium text-foreground">{ctx.episode.title}</span>.
          {!ctx.is_locked &&
            " Share a few details so we can introduce you properly. It takes about five minutes."}
        </p>
        {ctx.episode.recording_at && (
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4" /> Recording <LocalDateTime value={ctx.episode.recording_at} />
          </p>
        )}
      </header>

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
          />
        </>
      )}
    </>
  );
}
