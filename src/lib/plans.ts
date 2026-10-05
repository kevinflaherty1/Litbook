/**
 * Plan tiers. Limits are enforced in the database (public.plan_limits and
 * its triggers); keep the numbers here in sync for display and messages.
 */
export const PLANS = {
  starter: {
    name: "Starter",
    price: "$12/month",
    seats: 2,
    episodesPerMonth: 5 as number | null,
    features: ["2 team members", "5 new episodes a month", "Guest portal, vault, exports and reminders"],
  },
  pro: {
    name: "Pro",
    price: "$29/month",
    seats: 10,
    episodesPerMonth: null as number | null,
    features: [
      "10 team members",
      "Unlimited episodes",
      "Custom branding on the guest page",
      "Custom guest questions",
      "Logo, intro audio and media kit uploads",
    ],
  },
} as const;

export type Plan = keyof typeof PLANS;
export const PLAN_KEYS = Object.keys(PLANS) as Plan[];

/** Features only Pro includes when billing is on. */
export type ProFeature = "branding" | "custom_questions" | "guest_files";

/**
 * Whether an org can use a Pro feature. With billing off (self-hosted,
 * development) everything is available.
 */
export function planAllows(plan: string | null | undefined, _feature: ProFeature, billingOn: boolean) {
  return !billingOn || plan === "pro";
}

export const PRO_REQUIRED = "This is a Pro feature. Upgrade in Settings → Billing to use it.";

/** Friendly message for the database's plan-limit error (SQLSTATE 53400). */
export function limitMessage(kind: "seats" | "episodes", plan: string | null | undefined) {
  const p = plan === "starter" || plan === "pro" ? PLANS[plan] : null;
  if (kind === "seats") {
    return p
      ? `Your ${p.name} plan includes ${p.seats} team members (pending invitations count). Upgrade or remove someone to add more.`
      : "You've reached your plan's team member limit.";
  }
  return p?.episodesPerMonth
    ? `Your ${p.name} plan includes ${p.episodesPerMonth} new episodes a month. Upgrade to Pro for unlimited episodes.`
    : "You've reached your plan's episode limit for this month.";
}
