import { z } from "zod";

export const billingActionSchema = z.object({ orgId: z.uuid() });
export const checkoutSchema = z.object({ orgId: z.uuid(), plan: z.enum(["starter", "pro"]).default("pro") });

export const deleteOrganizationSchema = z.object({
  orgId: z.uuid(),
  confirmSlug: z.string().trim().min(1, "Type the workspace URL to confirm."),
});

export type DeleteOrganizationInput = z.input<typeof deleteOrganizationSchema>;
