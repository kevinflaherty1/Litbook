import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ONBOARDING_STATUS_LABEL, type OnboardingStatus } from "@/schemas/booking";

const STYLES: Record<OnboardingStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  assets_submitted: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground",
};

export function BookingStatusBadge({ status }: { status: OnboardingStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", STYLES[status])}>
      {ONBOARDING_STATUS_LABEL[status]}
    </Badge>
  );
}

/** "3 guests · 1 submitted" style summary for lists. */
export function bookingSummary(bookings: { status: OnboardingStatus }[]) {
  const active = bookings.filter((b) => b.status !== "cancelled");
  if (!active.length) return "No guests yet";
  const done = active.filter((b) => b.status !== "pending").length;
  const guests = `${active.length} ${active.length === 1 ? "guest" : "guests"}`;
  return done ? `${guests} · ${done} submitted` : guests;
}
