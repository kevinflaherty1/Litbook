import { z } from "zod";

export const ASSET_KINDS = ["company_logo", "intro_audio", "media_kit"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

const MB = 1024 * 1024;

// Keep in sync with public.guest_file_allowed() in
// supabase/migrations/20261005010000_guest_files.sql
export const ASSET_SPECS: Record<
  AssetKind,
  {
    label: string;
    description: string;
    /** MIME type → file extension. */
    types: Record<string, string>;
    maxBytes: number;
    hint: string;
  }
> = {
  company_logo: {
    label: "Company logo",
    description: "Your company or project logo, for the episode artwork and show notes.",
    types: { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" },
    maxBytes: 10 * MB,
    hint: "PNG, JPG or WebP, up to 10 MB.",
  },
  intro_audio: {
    label: "Intro audio",
    description: "A short recording of you introducing yourself, or how to say your name.",
    types: {
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
    },
    maxBytes: 50 * MB,
    hint: "MP3, M4A or WAV, up to 50 MB.",
  },
  media_kit: {
    label: "Media kit",
    description: "A one-sheet or press kit with more about you.",
    types: { "application/pdf": "pdf" },
    maxBytes: 25 * MB,
    hint: "PDF, up to 25 MB.",
  },
};

export function isAllowedAssetType(kind: AssetKind, contentType: string) {
  return contentType in ASSET_SPECS[kind].types;
}

/** Browsers report some audio files with variant or empty types; normalise by extension. */
export function guessAssetType(kind: AssetKind, file: { type: string; name: string }) {
  if (isAllowedAssetType(kind, file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return Object.entries(ASSET_SPECS[kind].types).find(([, e]) => e === ext)?.[0] ?? null;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export const assetUploadSchema = z
  .object({
    token: z.string().min(32).max(128), // same as onboardingTokenSchema (schemas/portal imports this file)
    kind: z.enum(ASSET_KINDS),
    contentType: z.string().max(100),
    size: z.number().int().positive(),
  })
  .superRefine((v, ctx) => {
    const spec = ASSET_SPECS[v.kind];
    if (!isAllowedAssetType(v.kind, v.contentType)) {
      ctx.addIssue({ code: "custom", path: ["contentType"], message: `Use ${spec.hint.split(",")[0]}.` });
    }
    if (v.size > spec.maxBytes) {
      ctx.addIssue({ code: "custom", path: ["size"], message: `That file is too big. ${spec.hint}` });
    }
  });

/** Per kind: a newly uploaded file, null to remove the current one, or absent to keep it. */
export const submittedAssetsSchema = z
  .partialRecord(
    z.enum(ASSET_KINDS),
    z.object({ path: z.string().min(1).max(300), fileName: z.string().trim().min(1).max(200) }).nullable(),
  )
  .default({});

export const updateRequestedAssetsSchema = z.object({
  orgId: z.uuid(),
  kinds: z.array(z.enum(ASSET_KINDS)).max(ASSET_KINDS.length),
});
