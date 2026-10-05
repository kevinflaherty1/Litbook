import { z } from "zod";

export const CUSTOM_FIELD_TYPES = ["short_text", "long_text", "url", "select", "checkbox"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  short_text: "Short answer",
  long_text: "Paragraph",
  url: "Link",
  select: "Multiple choice",
  checkbox: "Checkbox",
};

export const MAX_ACTIVE_CUSTOM_FIELDS = 25;

/** A question as the guest portal sees it. */
export const customFieldSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  help_text: z.string().nullable(),
  field_type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(z.string()),
  required: z.boolean(),
});
export type CustomField = z.infer<typeof customFieldSchema>;

export type CustomAnswers = Record<string, string | boolean>;

/** Raw answers as the form sends them: one entry per field id. */
export const rawCustomAnswersSchema = z
  .record(z.uuid(), z.union([z.string().max(10000), z.boolean()]))
  .default({});

const MAX_LENGTH: Record<Exclude<CustomFieldType, "checkbox" | "select">, number> = {
  short_text: 500,
  long_text: 5000,
  url: 500,
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Validates a guest's answers against the workspace's questions. Used by the
 * portal form (for inline errors) and again by the server action. Unknown
 * keys are dropped; empty optional answers are left out.
 */
export function customAnswersSchema(fields: CustomField[]) {
  const shape: Record<string, z.ZodType<string | boolean | undefined>> = {};
  for (const f of fields) {
    if (f.field_type === "checkbox") {
      shape[f.id] = z
        .boolean()
        .optional()
        .refine((v) => !f.required || v === true, "Please tick this box to continue.");
      continue;
    }
    let text = z.string().trim();
    if (f.field_type !== "select") {
      const max = MAX_LENGTH[f.field_type];
      text = text.max(max, `Keep it under ${max.toLocaleString("en-US")} characters.`);
    }
    shape[f.id] = z
      .string()
      .optional()
      .transform((v) => v ?? "")
      .pipe(text)
      .transform((v) => (f.field_type === "url" && v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
      .refine((v) => !f.required || v.length > 0, "This question is required.")
      .refine((v) => f.field_type !== "url" || !v || isHttpUrl(v), "Enter a valid link, like example.com.")
      .refine((v) => f.field_type !== "select" || !v || f.options.includes(v), "Choose one of the options.")
      .transform((v) => v || undefined);
  }
  return z
    .object(shape)
    .transform(
      (answers) =>
        Object.fromEntries(
          Object.entries(answers).filter(([, v]) => v !== undefined && v !== false),
        ) as CustomAnswers,
    );
}

/** One option per line in the editor; blank lines and duplicates are dropped. */
const optionsText = z
  .string()
  .max(5000)
  .transform((v) => [
    ...new Set(
      v
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  ])
  .pipe(
    z.array(z.string().max(200, "Keep each option under 200 characters.")).max(30, "Use at most 30 options."),
  );

const fieldDefinition = {
  label: z.string().trim().min(1, "Enter the question.").max(200, "Keep it under 200 characters."),
  helpText: z
    .string()
    .trim()
    .max(500, "Keep it under 500 characters.")
    .transform((v) => v || null),
  required: z.boolean(),
  options: optionsText,
};

export const createCustomFieldSchema = z
  .object({ orgId: z.uuid(), fieldType: z.enum(CUSTOM_FIELD_TYPES), ...fieldDefinition })
  .refine((v) => v.fieldType !== "select" || v.options.length > 0, {
    path: ["options"],
    message: "Add at least one option.",
  });

export const updateCustomFieldSchema = z.object({
  orgId: z.uuid(),
  fieldId: z.uuid(),
  ...fieldDefinition,
});

export const customFieldIdSchema = z.object({ orgId: z.uuid(), fieldId: z.uuid() });
export const moveCustomFieldSchema = customFieldIdSchema.extend({ direction: z.enum(["up", "down"]) });
export const archiveCustomFieldSchema = customFieldIdSchema.extend({ archived: z.boolean() });

export type CreateCustomFieldInput = z.input<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.input<typeof updateCustomFieldSchema>;
