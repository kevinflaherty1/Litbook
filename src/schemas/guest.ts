import { z } from "zod";

import { emailSchema } from "./auth";

const guestFields = {
  fullName: z.string().trim().min(1, "Enter the guest's name.").max(120, "Keep it under 120 characters."),
  email: z.union([z.literal(""), emailSchema]).transform((v) => v || null),
};

export const createGuestSchema = z.object({
  orgId: z.uuid(),
  ...guestFields,
  internalNotes: z
    .string()
    .trim()
    .max(5000, "Keep it under 5,000 characters.")
    .transform((v) => v || null),
});
export const updateGuestSchema = createGuestSchema.extend({ guestId: z.uuid() });
export const deleteGuestSchema = z.object({ orgId: z.uuid(), guestId: z.uuid() });

export const guestListFilterSchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

export type CreateGuestInput = z.input<typeof createGuestSchema>;
export type UpdateGuestInput = z.input<typeof updateGuestSchema>;
