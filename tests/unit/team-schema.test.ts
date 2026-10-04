import { describe, expect, it } from "vitest";

import { signUpSchema } from "@/schemas/auth";
import { inviteMemberSchema } from "@/schemas/team";

const orgId = "3f2c4b8e-9d1a-4c6b-8e2f-1a2b3c4d5e6f";

describe("inviteMemberSchema", () => {
  it("normalises email", () => {
    const parsed = inviteMemberSchema.parse({ orgId, email: "  Pat@Example.COM ", role: "member" });
    expect(parsed.email).toBe("pat@example.com");
  });

  it("does not allow inviting owners", () => {
    expect(inviteMemberSchema.safeParse({ orgId, email: "pat@example.com", role: "owner" }).success).toBe(
      false,
    );
  });

  it("requires a valid org id", () => {
    expect(
      inviteMemberSchema.safeParse({ orgId: "acme", email: "pat@example.com", role: "member" }).success,
    ).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("requires a name and valid email", () => {
    expect(signUpSchema.safeParse({ email: "nope", fullName: "Pat" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "pat@example.com", fullName: "" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "pat@example.com", fullName: "Pat" }).success).toBe(true);
  });
});
