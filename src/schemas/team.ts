import { z } from "zod";

import { emailSchema } from "./auth";

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const inviteMemberSchema = z.object({
  orgId: z.uuid(),
  email: emailSchema,
  role: z.enum(["admin", "member"]),
});

export const changeRoleSchema = z.object({
  orgId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(ORG_ROLES),
});

export const removeMemberSchema = z.object({
  orgId: z.uuid(),
  userId: z.uuid(),
});

export const revokeInvitationSchema = z.object({
  orgId: z.uuid(),
  invitationId: z.uuid(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(128),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name.").max(120, "Keep it under 120 characters."),
});

export type InviteMemberInput = z.input<typeof inviteMemberSchema>;
