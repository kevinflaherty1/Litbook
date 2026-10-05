import { z } from "zod";

export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().toLowerCase().min(1, "Type your email address to confirm."),
});
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;
