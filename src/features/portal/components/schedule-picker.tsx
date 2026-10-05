"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, CalendarPlus, Loader2, Video } from "lucide-react";
import { toast } from "sonner";

import { LocalDateTime } from "@/components/shared/local-date-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pickRecordingSlot, releaseRecordingSlot } from "@/features/portal/actions";
import { cn } from "@/lib/utils";

type Slot = { id: string; starts_at: string; duration_minutes: number; mine: boolean };

const SLOT_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/** Guest side: pick one of the host's recording times, then add it to a calendar. */
export function SchedulePicker({
  token,
  slots,
  meetingUrl,
  googleCalendarUrl,
}: {
  token: string;
  slots: Slot[];
  meetingUrl: string | null;
  /** Prebuilt on the server for the picked slot. */
  googleCalendarUrl: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const mine = slots.find((s) => s.mine) ?? null;
  const [changing, setChanging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const open = slots.filter((s) => !s.mine);

  const confirm = () =>
    startTransition(async () => {
      if (!selected) return;
      const result = await pickRecordingSlot({ token, slotId: selected });
      if (result.ok) {
        toast.success("You're booked! Check your email for the calendar invite.");
        setChanging(false);
        setSelected(null);
      } else toast.error(result.error);
    });

  const release = () =>
    startTransition(async () => {
      const result = await releaseRecordingSlot({ token });
      if (result.ok) toast.success("Time released. Your host has been told.");
      else toast.error(result.error);
    });

  if (mine && !changing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-5 text-emerald-600" /> You&apos;re booked to record
          </CardTitle>
          <CardDescription>
            <LocalDateTime
              value={mine.starts_at}
              options={SLOT_FORMAT}
              className="font-medium text-foreground"
            />{" "}
            · {mine.duration_minutes} minutes
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {meetingUrl && /^https?:\/\//i.test(meetingUrl) && (
            <a
              href={meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <Video className="size-4" /> {meetingUrl}
            </a>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/submit/${token}/invite.ics`}>
                <CalendarPlus /> Add to calendar (.ics)
              </a>
            </Button>
            {googleCalendarUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={googleCalendarUrl} target="_blank" rel="noopener noreferrer">
                  <CalendarPlus /> Google Calendar
                </a>
              </Button>
            )}
            {open.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setChanging(true)} disabled={isPending}>
                Change time
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={release} disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}I can&apos;t make it
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a recording time</CardTitle>
        <CardDescription>Times are shown in your time zone.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {open.length ? (
          <div role="radiogroup" aria-label="Recording times" className="grid gap-2 sm:grid-cols-2">
            {open.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected === s.id}
                onClick={() => setSelected(s.id)}
                className={cn(
                  "grid gap-0.5 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected === s.id && "border-primary bg-accent",
                )}
              >
                <LocalDateTime value={s.starts_at} options={SLOT_FORMAT} className="font-medium" />
                <span className="text-muted-foreground">{s.duration_minutes} minutes</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            All the offered times are taken. Reply to your host and they&apos;ll offer more.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {open.length > 0 && (
            <Button onClick={confirm} disabled={!selected || isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              Confirm time
            </Button>
          )}
          {changing && (
            <Button variant="ghost" onClick={() => setChanging(false)} disabled={isPending}>
              Keep my current time
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">None of these work? Reply to your host&apos;s email.</p>
      </CardContent>
    </Card>
  );
}
