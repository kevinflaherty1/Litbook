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

    await removeStoragePrefix(`${org.id}/`);
    // organizations has no DELETE grant for signed-in users; the owner check above authorises this.
    const { error: deleteError } = await createAdminClient().from("organizations").delete().eq("id", org.id);
    if (deleteError) throw deleteError;

    redirect("/dashboard");
  },
);
