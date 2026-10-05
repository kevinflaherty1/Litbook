"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Loader2, Plus, Trash2, Unlink, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/shared/confirm-button";
import { DateTimeInput } from "@/components/shared/date-time-input";
import { LocalDateTime } from "@/components/shared/local-date-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { addRecordingSlots, deleteRecordingSlot, freeRecordingSlot } from "@/features/scheduling/actions";
import type { ActionResult } from "@/lib/action-result";
import { SLOT_DURATIONS } from "@/schemas/scheduling";

type Slot = {
  id: string;
  starts_at: string;
  duration_minutes: number;
  guestName: string | null;
};

const durationLabel = (m: number) =>
  m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;

/** Host side: offer recording times on an episode and see who picked which. */
export function RecordingSlots({
  orgId,
  episodeId,
  slots,
}: {
  orgId: string;
  episodeId: string;
  slots: Slot[];
}) {
  const [isPending, startTransition] = useTransition();
  const [times, setTimes] = useState<string[]>([""]);
  const [duration, setDuration] = useState("60");
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<ActionResult<unknown>>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });

  const add = () => {
    const startsAt = times.filter(Boolean);
    if (!startsAt.length) return setError("Pick at least one date and time.");
    setError(null);
    startTransition(async () => {
      const result = await addRecordingSlots({
        orgId,
        episodeId,
        startsAt,
        durationMinutes: Number(duration),
      });
      if (result.ok) {
        toast.success(result.data.added === 1 ? "Time added" : `${result.data.added} times added`);
        setTimes([""]);
      } else {
        setError(result.fieldErrors?.startsAt?.[0] ?? result.error);
      }
    });
  };

  return (
    <div className="grid gap-6">
      {slots.length > 0 ? (
        <ul className="grid divide-y rounded-md border" aria-label="Recording times">
          {slots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <LocalDateTime
                  value={s.starts_at}
                  options={{
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }}
                  className="font-medium"
                />
                <span className="text-xs text-muted-foreground">{durationLabel(s.duration_minutes)}</span>
              </div>
              {s.guestName ? <Badge>Picked by {s.guestName}</Badge> : <Badge variant="secondary">Open</Badge>}
              <div className="flex items-center gap-1">
                {s.guestName && (
                  <ConfirmButton
                    title={`Free this time?`}
                    description={`${s.guestName} will need to pick another time. They aren't notified automatically.`}
                    confirmLabel="Free time"
                    onConfirm={() => run(() => freeRecordingSlot({ orgId, slotId: s.id }), "Time freed")}
                  >
                    <Button variant="ghost" size="icon" aria-label="Free this time" disabled={isPending}>
                      <Unlink />
                    </Button>
                  </ConfirmButton>
                )}
                <ConfirmButton
                  title="Remove this time?"
                  description={
                    s.guestName
                      ? `${s.guestName} picked it and will need to pick another time.`
                      : "Guests won't be able to pick it anymore."
                  }
                  confirmLabel="Remove"
                  onConfirm={() => run(() => deleteRecordingSlot({ orgId, slotId: s.id }), "Time removed")}
                >
                  <Button variant="ghost" size="icon" aria-label="Remove this time" disabled={isPending}>
                    <Trash2 />
                  </Button>
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No times offered yet. Add a few and each guest picks one on their onboarding page.
        </p>
      )}

      <div className="grid gap-3 border-t pt-6">
        <span className="text-sm font-medium">Offer times</span>
        {times.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <DateTimeInput
              aria-label={`Recording time ${i + 1}`}
              className="max-w-64"
              value={t}
              onChange={(iso) => setTimes((all) => all.map((v, j) => (j === i ? iso : v)))}
            />
            {times.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove time ${i + 1}`}
                onClick={() => setTimes((all) => all.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTimes((all) => [...all, ""])}
            disabled={times.length >= 20}
          >
            <Plus /> Another time
          </Button>
          <div className="grid gap-1.5">
            <Label htmlFor="slot-duration">Length</Label>
            <NativeSelect
              id="slot-duration"
              className="w-32"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              {SLOT_DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {durationLabel(m)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="button" onClick={add} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
            Add times
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Times are in your time zone; guests see them in theirs.
        </p>
      </div>
    </div>
  );
}
