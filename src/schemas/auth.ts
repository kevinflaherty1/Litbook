import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

export const signInSchema = z.object({
  email: emailSchema,
  next: z.string().max(2000).optional(),
});

export const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(1, "Enter your name.").max(120, "Keep it under 120 characters."),
});

export const oauthSchema = z.object({
  provider: z.enum(["google"]),
  next: z.string().max(2000).optional(),
});

export type SignInInput = z.input<typeof signInSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;
