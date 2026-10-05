"use server";

import { refresh } from "next/cache";

import { requireProFeature } from "@/features/billing/gate";
import { fail, ok } from "@/lib/action-result";
import { orgAction } from "@/lib/safe-action";
import {
  archiveCustomFieldSchema,
  createCustomFieldSchema,
  MAX_ACTIVE_CUSTOM_FIELDS,
  moveCustomFieldSchema,
  updateCustomFieldSchema,
} from "@/schemas/custom-fields";

const ADMINS = { roles: ["owner", "admin"] as ("owner" | "admin")[] };

export const createCustomField = orgAction(
  createCustomFieldSchema,
  ADMINS,
  async (input, { supabase, org }) => {
    const gate = await requireProFeature(supabase, org.id, "custom_questions");
    if (gate) return gate;
    const { data: existing, error: countError } = await supabase
      .from("custom_fields")
      .select("position, archived_at")
      .eq("organization_id", org.id);
    if (countError) throw countError;
    if (existing.filter((f) => !f.archived_at).length >= MAX_ACTIVE_CUSTOM_FIELDS) {
      return fail(`You can have up to ${MAX_ACTIVE_CUSTOM_FIELDS} active questions. Archive one first.`);
    }

    const { error } = await supabase.from("custom_fields").insert({
      organization_id: org.id,
      label: input.label,
      help_text: input.helpText,
      field_type: input.fieldType,
      options: input.fieldType === "select" ? input.options : [],
      required: input.required,
      position: Math.max(-1, ...existing.map((f) => f.position)) + 1,
    });
    if (error) throw error;
    refresh();
    return ok(undefined);
  },
);

export const updateCustomField = orgAction(
  updateCustomFieldSchema,
  ADMINS,
  async (input, { supabase, org }) => {
    const { data: field, error: readError } = await supabase
      .from("custom_fields")
      .select("field_type")
      .eq("organization_id", org.id)
      .eq("id", input.fieldId)
      .maybeSingle();
    if (readError) throw readError;
    if (!field) return fail("That question no longer exists.");
    if (field.field_type === "select" && input.options.length === 0) {
      return fail("Add at least one option.", { options: ["Add at least one option."] });
    }

    const { error } = await supabase
      .from("custom_fields")
      .update({
        label: input.label,
        help_text: input.helpText,
        required: input.required,
        ...(field.field_type === "select" ? { options: input.options } : {}),
      })
      .eq("organization_id", org.id)
      .eq("id", input.fieldId);
    if (error) throw error;
    refresh();
    return ok(undefined);
  },
);

/** Swaps a question with its neighbour among the active questions. */
export const moveCustomField = orgAction(moveCustomFieldSchema, ADMINS, async (input, { supabase, org }) => {
  const { data: fields, error } = await supabase
    .from("custom_fields")
    .select("id, position")
    .eq("organization_id", org.id)
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const index = fields.findIndex((f) => f.id === input.fieldId);
  const other = index + (input.direction === "up" ? -1 : 1);
  if (index < 0 || other < 0 || other >= fields.length) return ok(undefined);

  // Renumber everything so ties from older rows can't stall a move.
  const ordered = fields.map((f) => f.id);
  [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
  for (const [position, id] of ordered.entries()) {
    const { error: updateError } = await supabase
      .from("custom_fields")
      .update({ position })
      .eq("organization_id", org.id)
      .eq("id", id);
    if (updateError) throw updateError;
  }
  refresh();
  return ok(undefined);
});

/** Archived questions disappear from the guest page; their answers are kept. */
export const setCustomFieldArchived = orgAction(
  archiveCustomFieldSchema,
  ADMINS,
  async (input, { supabase, org }) => {
    if (!input.archived) {
      const { count, error: countError } = await supabase
        .from("custom_fields")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .is("archived_at", null);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_ACTIVE_CUSTOM_FIELDS) {
        return fail(`You can have up to ${MAX_ACTIVE_CUSTOM_FIELDS} active questions. Archive one first.`);
      }
    }
    const { error } = await supabase
      .from("custom_fields")
      .update({ archived_at: input.archived ? new Date().toISOString() : null })
      .eq("organization_id", org.id)
      .eq("id", input.fieldId);
    if (error) throw error;
    refresh();
    return ok(undefined);
  },
);
