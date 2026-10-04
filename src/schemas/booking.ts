import { z } from "zod";

import { emailSchema } from "./auth";

export const ONBOARDING_STATUSES = ["pending", "assets_submitted", "ready", "cancelled"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_STATUS_LABEL: Record<OnboardingStatus, string> = {
  pending: "Waiting on guest",
  assets_submitted: "Submitted",
  ready: "Ready",
  cancelled: "Cancelled",
};

/** Book someone already in the guest directory. */
export const bookExistingGuestSchema = z.object({
  orgId: z.uuid(),
  episodeId: z.uuid(),
  guestId: z.uuid("Choose a guest."),
});

/** Add a guest to the directory (or reuse a match by email) and book them. */
export const bookNewGuestSchema = z.object({
  orgId: z.uuid(),
  episodeId: z.uuid(),
  fullName: z.string().trim().min(1, "Enter the guest's name.").max(120, "Keep it under 120 characters."),
  email: z.union([z.literal(""), emailSchema]).transform((v) => v || null),
});

export const bookingRefSchema = z.object({ orgId: z.uuid(), bookingId: z.uuid() });

export const setBookingCancelledSchema = bookingRefSchema.extend({ cancelled: z.boolean() });

export type BookExistingGuestInput = z.input<typeof bookExistingGuestSchema>;
export type BookNewGuestInput = z.input<typeof bookNewGuestSchema>;
