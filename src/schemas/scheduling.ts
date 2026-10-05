import { z } from "zod";

export const SLOT_DURATIONS = [15, 30, 45, 60, 90, 120, 180] as const;

export const addSlotsSchema = z.object({
  orgId: z.uuid(),
  episodeId: z.uuid(),
  /** ISO timestamps converted from the host's local time in the browser. */
  startsAt: z
    .array(z.iso.datetime({ offset: true, message: "Enter a valid date and time." }))
    .min(1, "Add at least one time.")
    .max(20, "Add up to 20 times at once."),
  durationMinutes: z.coerce.number().int().min(15).max(480),
});

export const slotIdSchema = z.object({ orgId: z.uuid(), slotId: z.uuid() });

export const pickSlotSchema = z.object({ token: z.string().min(32).max(128), slotId: z.uuid() });
export const releaseSlotSchema = z.object({ token: z.string().min(32).max(128) });

export type AddSlotsInput = z.input<typeof addSlotsSchema>;
