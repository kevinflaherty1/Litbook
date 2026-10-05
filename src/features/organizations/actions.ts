"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { fail, ok } from "@/lib/action-result";
import { isPgError, PG } from "@/lib/errors";
import { authedAction, orgAction } from "@/lib/safe-action";
import { requireProFeature } from "@/features/billing/gate";
import { BillingNotConfiguredError, destroyOrganization } from "@/features/organizations/destroy";
import { updateRequestedAssetsSchema } from "@/schemas/assets";
import { deleteOrganizationSchema } from "@/schemas/billing";
import {
  createOrganizationSchema,
  updateBrandingSchema,
  updateOrganizationSchema,
  updateGuestRemindersSchema,
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

/**
 * Permanently deletes a workspace: cancels its Stripe subscription, removes
 * its files, then deletes the org (which cascades to all its data). Owners
 * only, and they must type the workspace URL to confirm.
 */
export const deleteOrganization = orgAction(
  deleteOrganizationSchema,
  { roles: ["owner"] },
  async (input, { org }) => {
    if (input.confirmSlug.toLowerCase() !== org.slug) {
      return fail("That doesn't match the workspace URL.", { confirmSlug: [`Type ${org.slug} to confirm.`] });
    }

    try {
      await destroyOrganization(org.id);
    } catch (error) {
      if (error instanceof BillingNotConfiguredError) {
        return fail("This workspace has a subscription but billing isn't configured here. Contact support.");
      }
      throw error;
    }

    redirect("/dashboard");
  },
);

export const updateGuestReminders = orgAction(
  updateGuestRemindersSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org }) => {
    const { error } = await supabase
      .from("organizations")
      .update({ guest_reminders_enabled: input.enabled })
      .eq("id", org.id);
    if (error) throw error;
    refresh();
    return ok(undefined);
  },
);

/**
 * Guest page branding. A new logo is uploaded by the browser straight to the
 * org-branding bucket (Storage policies allow owners and admins only); this
 * checks it landed under the org's prefix, saves it, and removes the old one.
 */
export const updateBranding = orgAction(
  updateBrandingSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org }) => {
    const gate = await requireProFeature(supabase, org.id, "branding");
    if (gate) return gate;
    const { data: current, error: readError } = await supabase
      .from("organizations")
      .select("logo_path")
      .eq("id", org.id)
      .single();
    if (readError) throw readError;

    let logoPath = current.logo_path;
    if (input.removeLogo) logoPath = null;
    if (input.logoPath) {
      const prefix = `${org.id}/`;
      const name = input.logoPath.slice(prefix.length);
      if (!input.logoPath.startsWith(prefix) || !name || name.includes("/")) {
        return fail("That logo upload isn't valid. Please upload it again.");
      }
      const { data: found, error: listError } = await supabase.storage
        .from("org-branding")
        .list(org.id, { search: name, limit: 1 });
      if (listError) throw listError;
      if (!found.some((f) => f.name === name))
        return fail("The logo didn't finish uploading. Please try again.");
      logoPath = input.logoPath;
    }

    const { error } = await supabase
      .from("organizations")
      .update({ logo_path: logoPath, brand_color: input.brandColor, portal_welcome: input.portalWelcome })
      .eq("id", org.id);
    if (error) throw error;

    if (current.logo_path && current.logo_path !== logoPath) {
      const { error: removeError } = await supabase.storage.from("org-branding").remove([current.logo_path]);
      if (removeError) console.error("[branding] could not remove old logo", removeError);
    }
    refresh();
    return ok(undefined);
  },
);

export const updateRequestedAssets = orgAction(
  updateRequestedAssetsSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org }) => {
    // Turning requests off is always allowed, so a downgraded workspace can tidy up.
    if (input.kinds.length) {
      const gate = await requireProFeature(supabase, org.id, "guest_files");
      if (gate) return gate;
    }
    const { error } = await supabase
      .from("organizations")
      .update({ requested_assets: [...new Set(input.kinds)] })
      .eq("id", org.id);
    if (error) throw error;
    refresh();
    return ok(undefined);
  },
);
