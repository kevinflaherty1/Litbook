"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Link2, Mail, MoreHorizontal, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { LocalDateTime } from "@/components/shared/local-date-time";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  emailOnboardingLink,
  generateOnboardingLink,
  removeBooking,
  setBookingCancelled,
} from "@/features/bookings/actions";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status-badge";
import { OnboardingLinkDialog } from "@/features/bookings/components/onboarding-link-dialog";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import type { OnboardingStatus } from "@/schemas/booking";

export type BookingRow = {
  id: string;
  status: OnboardingStatus;
  token_expires_at: string | null;
  token_last_used_at: string | null;
  submitted_at: string | null;
  linkExpired: boolean;
  link_emailed_at: string | null;
  reminder_count: number;
  guests: { id: string; full_name: string; email: string | null };
  /** The recording time the guest picked, if any (at most one). */
  recording_slots?: { starts_at: string }[];
};

const DATE_ONLY: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

function LinkState({ booking }: { booking: BookingRow }) {
  if (booking.status === "cancelled") return <span>Link turned off</span>;
  if (booking.status === "ready") return <span>Locked for editing</span>;
  if (booking.submitted_at) {
    return (
      <span>
        Submitted <LocalDateTime value={booking.submitted_at} options={DATE_ONLY} />
      </span>
    );
  }
  if (!booking.token_expires_at) return <span>No link yet</span>;
  if (booking.linkExpired) return <span className="text-destructive">Link expired</span>;
  if (booking.token_last_used_at) {
    return (
      <span>
        Opened <LocalDateTime value={booking.token_last_used_at} options={DATE_ONLY} />
      </span>
    );
  }
  if (booking.link_emailed_at) {
    const n = booking.reminder_count;
    return (
      <span>
        Emailed <LocalDateTime value={booking.link_emailed_at} options={DATE_ONLY} />
        {n > 0 && ` · ${n} ${n === 1 ? "reminder" : "reminders"} sent`}
      </span>
    );
  }
  return (
    <span>
      Link expires <LocalDateTime value={booking.token_expires_at} options={DATE_ONLY} />
    </span>
  );
}

export function BookingsTable({
  orgId,
  orgSlug,
  bookings,
}: {
  orgId: string;
  orgSlug: string;
  bookings: BookingRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState<{ guestName: string; url: string; note?: string } | null>(null);
  const [replacing, setReplacing] = useState<{ booking: BookingRow; mode: "copy" | "email" } | null>(null);

  function run<T>(action: () => Promise<ActionResult<T>>, onSuccess: (data: T) => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess(result.data);
      else toast.error(result.error);
    });
  }

  function issueLink(booking: BookingRow) {
    run(
      () => generateOnboardingLink({ orgId, bookingId: booking.id }),
      ({ url }) => setLink({ guestName: booking.guests.full_name, url }),
    );
  }

  function emailLink(booking: BookingRow) {
    run(
      () => emailOnboardingLink({ orgId, bookingId: booking.id }),
      ({ url, emailed, email }) => {
        if (emailed) toast.success(`Link emailed to ${email}`);
        else
          setLink({
            guestName: booking.guests.full_name,
            url,
            note: "Email isn't set up for this workspace yet, so send this link yourself.",
          });
      },
    );
  }

  function start(booking: BookingRow, mode: "copy" | "email") {
    if (booking.token_expires_at) setReplacing({ booking, mode });
    else if (mode === "email") emailLink(booking);
    else issueLink(booking);
  }

  if (!bookings.length) {
    return <p className="text-sm text-muted-foreground">No guests booked yet. Add one below.</p>;
  }

  return (
    <>
      <ul className="divide-y" aria-label="Booked guests">
        {bookings.map((b) => {
          const name = b.guests.full_name;
          const canLink = b.status === "pending" || b.status === "assets_submitted";
          const hasActiveLink = !!b.token_expires_at;
          return (
            <li
              key={b.id}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0",
                b.status === "cancelled" && "text-muted-foreground",
              )}
            >
              <div className="grid min-w-0 flex-1 basis-56">
                <Link href={`/${orgSlug}/bookings/${b.id}`} className="w-fit font-medium hover:underline">
                  {name}
                </Link>
                {b.guests.email && (
                  <span className="text-xs break-all text-muted-foreground">{b.guests.email}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  <LinkState booking={b} />
                </span>
                {b.recording_slots?.[0] && b.status !== "cancelled" && (
                  <span className="text-xs text-muted-foreground">
                    Recording <LocalDateTime value={b.recording_slots[0].starts_at} />
                  </span>
                )}
              </div>
              <BookingStatusBadge status={b.status} />
              <div className="flex items-center gap-1">
                {canLink && b.guests.email && (
                  <Button variant="outline" size="sm" disabled={isPending} onClick={() => start(b, "email")}>
                    <Mail />
                    Email link
                  </Button>
                )}
                {canLink && (
                  <Button variant="outline" size="sm" disabled={isPending} onClick={() => start(b, "copy")}>
                    <Link2 />
                    {hasActiveLink ? "New link" : "Get link"}
                  </Button>
                )}
                {b.status === "cancelled" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => setBookingCancelled({ orgId, bookingId: b.id, cancelled: false }),
                        () => toast.success(`${name}'s booking was restored`),
                      )
                    }
                  >
                    <RotateCcw /> Restore
                  </Button>
                )}
                <BookingMenu
                  booking={b}
                  disabled={isPending}
                  onCancel={() =>
                    run(
                      () => setBookingCancelled({ orgId, bookingId: b.id, cancelled: true }),
                      () => toast.success(`${name}'s booking was cancelled`),
                    )
                  }
                  onRemove={() =>
                    run(
                      () => removeBooking({ orgId, bookingId: b.id }),
                      () => toast.success(`${name} was removed from this episode`),
                    )
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={replacing !== null} onOpenChange={(open) => !open && setReplacing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace {replacing?.booking.guests.full_name}&apos;s link?</AlertDialogTitle>
            <AlertDialogDescription>
              {replacing?.mode === "email"
                ? `We'll email a new link to ${replacing.booking.guests.email}. `
                : ""}
              The link you sent before will stop working. Anything they already submitted is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (replacing?.mode === "email") emailLink(replacing.booking);
                else if (replacing) issueLink(replacing.booking);
                setReplacing(null);
              }}
            >
              {replacing?.mode === "email" ? "Email new link" : "Create new link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OnboardingLinkDialog link={link} onOpenChange={(open) => !open && setLink(null)} />
    </>
  );
}

function BookingMenu({
  booking,
  disabled,
  onCancel,
  onRemove,
}: {
  booking: BookingRow;
  disabled: boolean;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState<"cancel" | "remove" | null>(null);
  const name = booking.guests.full_name;
  const canRemove = !booking.submitted_at;
  const canCancel = booking.status !== "cancelled";
  if (!canRemove && !canCancel) return null;

  const confirm = {
    cancel: {
      title: `Cancel ${name}'s booking?`,
      description:
        "Their onboarding link stops working. Anything they submitted is kept, and you can restore the booking later.",
      label: "Cancel booking",
      run: onCancel,
    },
    remove: {
      title: `Remove ${name} from this episode?`,
      description: "The booking and its link are deleted. They stay in your guest directory.",
      label: "Remove",
      run: onRemove,
    },
  }[confirming ?? "cancel"];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={disabled}
            aria-label={`More actions for ${name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canCancel && (
            <DropdownMenuItem onSelect={() => setConfirming("cancel")}>Cancel booking</DropdownMenuItem>
          )}
          {canRemove && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirming("remove")}>
              Remove from episode
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={confirm.run}>
              {confirm.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
