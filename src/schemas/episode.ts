import { z } from "zod";

export const EPISODE_STATUSES = ["draft", "scheduled", "recorded", "published", "archived"] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

export const EPISODE_STATUS_LABEL: Record<EpisodeStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  recorded: "Recorded",
  published: "Published",
  archived: "Archived",
};

/** An ISO timestamp from a datetime-local input (converted in the browser), or "" for none. */
const optionalTimestamp = z
  .union([z.literal(""), z.iso.datetime({ offset: true, message: "Enter a valid date and time." })])
  .transform((v) => v || null);

const episodeFields = {
  title: z.string().trim().min(1, "Give the episode a title.").max(200, "Keep it under 200 characters."),
  description: z
    .string()
    .trim()
    .max(5000, "Keep it under 5,000 characters.")
    .transform((v) => v || null),
  episodeNumber: z
    .string()
    .trim()
    .regex(/^\d{0,6}$/, "Use a whole number.")
    .refine((v) => v !== "0", "Episode numbers start at 1.")
    .transform((v) => (v ? Number(v) : null)),
  status: z.enum(EPISODE_STATUSES),
  recordingAt: optionalTimestamp,
  publishAt: optionalTimestamp,
};

export const createEpisodeSchema = z.object({ orgId: z.uuid(), ...episodeFields });
export const updateEpisodeSchema = createEpisodeSchema.extend({ episodeId: z.uuid() });
export const deleteEpisodeSchema = z.object({ orgId: z.uuid(), episodeId: z.uuid() });

export const episodeListFilterSchema = z.object({
  status: z.enum(EPISODE_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

export type CreateEpisodeInput = z.input<typeof createEpisodeSchema>;
export type UpdateEpisodeInput = z.input<typeof updateEpisodeSchema>;
