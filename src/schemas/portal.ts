import { z } from "zod";

import { submittedAssetsSchema } from "@/schemas/assets";
import { rawCustomAnswersSchema } from "@/schemas/custom-fields";

export const onboardingTokenSchema = z.string().min(32).max(128);

export const HEADSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const HEADSHOT_MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
export const HEADSHOT_EXTENSIONS: Record<(typeof HEADSHOT_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const SOCIAL_PLATFORMS = [
  { key: "x", label: "X / Twitter", placeholder: "@handle" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/you" },
  { key: "instagram", label: "Instagram", placeholder: "@handle" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@channel" },
  { key: "tiktok", label: "TikTok", placeholder: "@handle" },
  { key: "bluesky", label: "Bluesky", placeholder: "you.bsky.social" },
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]["key"];

/** Trimmed text with a max length; "" becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max.toLocaleString("en-US")} characters.`)
    .transform((v) => v || null);

/** Accepts "acme.com" or a full http(s) URL; adds https:// when missing. */
const websiteUrl = z
  .string()
  .trim()
  .max(500, "That URL is too long.")
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .refine((v) => {
    if (!v) return true;
    try {
      const url = new URL(v);
      return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Enter a valid website, like yourname.com.")
  .transform((v) => v || null);

const socialHandle = z
  .string()
  .trim()
  .max(200, "That's too long.")
  .refine((v) => !/\s/.test(v), "No spaces, just your handle or profile link.");

export const socialLinksSchema = z
  .object(
    Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, socialHandle.optional()])) as Record<
      SocialPlatform,
      z.ZodOptional<typeof socialHandle>
    >,
  )
  // Keep only the platforms the guest filled in.
  .transform(
    (links) => Object.fromEntries(Object.entries(links).filter(([, v]) => v)) as Record<string, string>,
  );

export const onboardingSubmissionSchema = z.object({
  token: onboardingTokenSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Enter your name as it should appear.")
    .max(120, "Keep it under 120 characters."),
  headline: optionalText(160),
  shortBio: z.string().trim().min(1, "Add a short bio.").max(300, "Keep it under 300 characters."),
  longBio: optionalText(5000),
  pronouns: optionalText(40),
  namePronunciation: optionalText(120),
  websiteUrl,
  socialLinks: socialLinksSchema,
  /** Storage key returned by the upload; "" keeps the existing headshot. */
  headshotPath: z
    .string()
    .max(300)
    .transform((v) => v || null),
  /** Answers to the workspace's own questions, checked against them by the server. */
  customAnswers: rawCustomAnswersSchema,
  /** Extra files the workspace asked for. */
  assets: submittedAssetsSchema,
  releaseAccepted: z.boolean().refine((v) => v, "Please agree to the release to continue."),
  releaseSignedName: z
    .string()
    .trim()
    .min(1, "Type your full name to sign.")
    .max(120, "Keep it under 120 characters."),
});

export const headshotUploadSchema = z.object({
  token: onboardingTokenSchema,
  contentType: z.enum(HEADSHOT_TYPES, "Upload a JPG, PNG or WebP image."),
  size: z.number().int().positive().max(HEADSHOT_MAX_BYTES, "Images must be 10 MB or smaller."),
});

export type OnboardingSubmissionInput = z.input<typeof onboardingSubmissionSchema>;

/** What a host may correct in a guest's submission. Release fields are never editable. */
export const submissionContentSchema = onboardingSubmissionSchema
  .pick({
    displayName: true,
    headline: true,
    shortBio: true,
    longBio: true,
    pronouns: true,
    namePronunciation: true,
    websiteUrl: true,
    socialLinks: true,
  })
  .extend({ orgId: z.uuid(), bookingId: z.uuid() });

export type SubmissionContentInput = z.input<typeof submissionContentSchema>;
