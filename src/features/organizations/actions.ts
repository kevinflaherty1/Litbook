"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { fail, ok } from "@/lib/action-result";
import { isPgError, PG } from "@/lib/errors";
import { authedAction, orgAction } from "@/lib/safe-action";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  updateReleaseFormSchema,
} from "@/schemas/organization";

const SLUG_TAKEN = { slug: ["That URL is already taken. Try another."] };

export const createOrganization = authedAction(createOrganizationSchema, async (input, { supabase }) => {
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: input.name,
    p_slug: input.slug,
  });

  if (isPgError(error, PG.uniqueViolation)) return fail("That URL is already taken.", SLUG_TAKEN);
  if (error) throw error;

  redirect(`/${data.slug}`);
});

export const updateOrganization = orgAction(
  updateOrganizationSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org }) => {
    const { error } = await supabase
      .from("organizations")
      .update({ name: input.name, slug: input.slug })
      .eq("id", org.id);

    if (isPgError(error, PG.uniqueViolation)) return fail("That URL is already taken.", SLUG_TAKEN);
    if (error) throw error;

    // The URL changed: send the user to the same page under the new slug.
    if (input.slug !== org.slug) redirect(`/${input.slug}/settings`);
    refresh();
    return ok(undefined);
  },
);

export const updateReleaseForm = orgAction(
  updateReleaseFormSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org }) => {
    const { data, error } = await supabase
      .from("organizations")
      .update({ release_form_text: input.releaseFormText })
      .eq("id", org.id)
      .select("release_form_version")
      .single();

    if (error) throw error;
    refresh();
    return ok({ version: data.release_form_version });
  },
);
