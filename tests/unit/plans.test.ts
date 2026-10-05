import { describe, expect, it } from "vitest";

import { limitMessage, planAllows, PLANS } from "@/lib/plans";

describe("plans", () => {
  it("unlocks Pro features only on Pro when billing is on", () => {
    expect(planAllows("pro", "branding", true)).toBe(true);
    expect(planAllows("starter", "branding", true)).toBe(false);
    expect(planAllows(null, "guest_files", true)).toBe(false);
  });

  it("unlocks everything when billing is off", () => {
    expect(planAllows(null, "custom_questions", false)).toBe(true);
    expect(planAllows("starter", "branding", false)).toBe(true);
  });

  it("explains limits in terms of the plan", () => {
    expect(limitMessage("episodes", "starter")).toContain(
      `${PLANS.starter.episodesPerMonth} new episodes a month`,
    );
    expect(limitMessage("seats", "starter")).toContain(`${PLANS.starter.seats} team members`);
    expect(limitMessage("seats", null)).toBe("You've reached your plan's team member limit.");
  });

  it("matches the limits enforced in the database", () => {
    // public.plan_limits(): starter 2 seats / 5 episodes, pro 10 seats / unlimited.
    expect([PLANS.starter.seats, PLANS.starter.episodesPerMonth]).toEqual([2, 5]);
    expect([PLANS.pro.seats, PLANS.pro.episodesPerMonth]).toEqual([10, null]);
  });
});
