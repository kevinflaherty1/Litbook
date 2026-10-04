import { describe, expect, it } from "vitest";

import { headshotUploadSchema, onboardingSubmissionSchema } from "@/schemas/portal";

const token = "a".repeat(43);
const valid = {
  token,
  displayName: " Ada Lovelace ",
  headline: "",
  shortBio: "Mathematician and first programmer.",
  longBio: "",
  pronouns: "",
  namePronunciation: "",
  websiteUrl: "",
  socialLinks: { x: "@ada", linkedin: "", instagram: "", youtube: "", tiktok: "", bluesky: "" },
  headshotPath: "",
  releaseAccepted: true,
  releaseSignedName: "Ada Lovelace",
};

describe("onboardingSubmissionSchema", () => {
  it("trims, nulls empty optionals, and drops empty social links", () => {
    const parsed = onboardingSubmissionSchema.parse(valid);
    expect(parsed).toMatchObject({
      displayName: "Ada Lovelace",
      headline: null,
      longBio: null,
      websiteUrl: null,
      headshotPath: null,
      socialLinks: { x: "@ada" },
    });
  });

  it.each([
    ["acme.com", "https://acme.com"],
    ["http://acme.com/about", "http://acme.com/about"],
    ["HTTPS://Acme.com", "HTTPS://Acme.com"],
  ])("normalises website %j", (input, expected) => {
    expect(onboardingSubmissionSchema.parse({ ...valid, websiteUrl: input }).websiteUrl).toBe(expected);
  });

  it.each(["javascript:alert(1)", "not a url", "localhost", "ftp://acme.com"])(
    "rejects website %j",
    (websiteUrl) => {
      expect(onboardingSubmissionSchema.safeParse({ ...valid, websiteUrl }).success).toBe(false);
    },
  );

  it("requires the release to be accepted and signed", () => {
    expect(onboardingSubmissionSchema.safeParse({ ...valid, releaseAccepted: false }).success).toBe(false);
    expect(onboardingSubmissionSchema.safeParse({ ...valid, releaseSignedName: "  " }).success).toBe(false);
  });

  it("enforces the database length limits", () => {
    expect(onboardingSubmissionSchema.safeParse({ ...valid, shortBio: "x".repeat(301) }).success).toBe(false);
    expect(onboardingSubmissionSchema.safeParse({ ...valid, shortBio: "" }).success).toBe(false);
    expect(onboardingSubmissionSchema.safeParse({ ...valid, headline: "x".repeat(161) }).success).toBe(false);
  });

  it("rejects social handles with spaces", () => {
    const socialLinks = { ...valid.socialLinks, x: "my handle" };
    expect(onboardingSubmissionSchema.safeParse({ ...valid, socialLinks }).success).toBe(false);
  });
});

describe("headshotUploadSchema", () => {
  it("accepts images up to 10 MB only", () => {
    expect(headshotUploadSchema.safeParse({ token, contentType: "image/png", size: 1024 }).success).toBe(
      true,
    );
    expect(headshotUploadSchema.safeParse({ token, contentType: "image/gif", size: 1024 }).success).toBe(
      false,
    );
    expect(
      headshotUploadSchema.safeParse({ token, contentType: "image/jpeg", size: 10 * 1024 * 1024 + 1 })
        .success,
    ).toBe(false);
  });
});
