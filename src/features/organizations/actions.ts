"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { fail, ok } from "@/lib/action-result";
import { isPgError, PG } from "@/lib/errors";
import { authedAction, orgAction } from "@/lib/safe-action";
import { serverEnv } from "@/lib/env.server";
import { billingEnabled, getStripe } from "@/lib/stripe";
import { removeStoragePrefix } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
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
  async (input, { supabase, org }) => {
    if (input.confirmSlug.toLowerCase() !== org.slug) {
      return fail("That doesn't match the workspace URL.", { confirmSlug: [`Type ${org.slug} to confirm.`] });
    }

    const { data: row, error } = await supabase
      .from("organizations")
      .select("stripe_subscription_id, subscription_status")
      .eq("id", org.id)
      .single();
    if (error) throw error;

    // Stop billing first: if this fails, nothing has been deleted yet.
    if (row.stripe_subscription_id && row.subscription_status && row.subscription_status !== "canceled") {
      if (!billingEnabled || !serverEnv.STRIPE_SECRET_KEY) {
        return fail("This workspace has a subscription but billing isn't configured here. Contact support.");
      }
      try {
        await getStripe().subscriptions.cancel(row.stripe_subscription_id);
      } catch (stripeError) {
        // Already cancelled or deleted in Stripe: fine to proceed.
        if ((stripeError as { code?: string }).code !== "resource_missing") throw stripeError;
      }
    }

    await Promise.all([removeStoragePrefix(`${org.id}/`), removeStoragePrefix(`${org.id}/`, "org-branding")]);
    // organizations has no DELETE grant for signed-in users; the owner check above authorises this.
    const { error: deleteError } = await createAdminClient().from("organizations").delete().eq("id", org.id);
    if (deleteError) throw deleteError;

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
