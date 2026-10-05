import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Every question in the workspace, active ones first, in display order. */
export const listCustomFields = cache(async (orgId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_fields")
    .select("id, label, help_text, field_type, options, required, position, archived_at, created_at")
    .eq("organization_id", orgId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
});

export type CustomFieldRow = Awaited<ReturnType<typeof listCustomFields>>[number];

/** Question/answer pairs for a submission, including archived questions that were answered. */
export type AnsweredQuestion = { id: string; label: string; answer: string | null; archived: boolean };

export function answeredQuestions(fields: CustomFieldRow[], answers: unknown): AnsweredQuestion[] {
  const map = (answers ?? {}) as Record<string, unknown>;
  return fields.flatMap((f): AnsweredQuestion[] => {
    const value = map[f.id];
    if (value === undefined || value === null || value === "" || value === false) {
      return f.archived_at ? [] : [{ id: f.id, label: f.label, answer: null, archived: false }];
    }
    const answer = typeof value === "boolean" ? "Yes" : String(value);
    return [{ id: f.id, label: f.label, answer, archived: !!f.archived_at }];
  });
}
