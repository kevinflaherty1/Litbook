"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { fail, ok } from "@/lib/action-result";
import { isPgError, PG } from "@/lib/errors";
import { orgAction } from "@/lib/safe-action";
import { removeStoragePrefix } from "@/lib/storage";
import { createGuestSchema, deleteGuestSchema, updateGuestSchema } from "@/schemas/guest";

const EMAIL_TAKEN = { email: ["A guest with this email is already in your directory."] };

export const createGuest = orgAction(createGuestSchema, {}, async (input, { supabase, org }) => {
  const { data, error } = await supabase
    .from("guests")
    .insert({
      organization_id: org.id,
      full_name: input.fullName,
      email: input.email,
      internal_notes: input.internalNotes,
    })
    .select("id")
    .single();

  if (isPgError(error, PG.uniqueViolation))
    return fail("That guest is already in your directory.", EMAIL_TAKEN);
  if (error) throw error;

  refresh();
  return ok({ id: data.id });
});

export const updateGuest = orgAction(updateGuestSchema, {}, async (input, { supabase, org }) => {
  const { data, error } = await supabase
    .from("guests")
    .update({ full_name: input.fullName, email: input.email, internal_notes: input.internalNotes })
    .eq("organization_id", org.id)
    .eq("id", input.guestId)
    .select("id");

  if (isPgError(error, PG.uniqueViolation))
    return fail("Another guest already uses that email.", EMAIL_TAKEN);
  if (error) throw error;
  if (!data.length) return fail("That guest no longer exists.");

  refresh();
  return ok(undefined);
});

export const deleteGuest = orgAction(
  deleteGuestSchema,
  { roles: ["owner", "admin"] },
  async (input, { supabase, org }) => {
    // Storage files aren't removed by the cascade; collect the bookings first.
    const { data: bookings, error: bookingsError } = await supabase
      .from("episode_guests")
      .select("id")
      .eq("organization_id", org.id)
      .eq("guest_id", input.guestId);
    if (bookingsError) throw bookingsError;

    const { data, error } = await supabase
      .from("guests")
      .delete()
      .eq("organization_id", org.id)
      .eq("id", input.guestId)
      .select("id");
    if (error) throw error;
    if (!data.length) return fail("That guest couldn't be deleted.");
    await Promise.all(bookings.map((b) => removeStoragePrefix(`${org.id}/${b.id}/`)));

    redirect(`/${org.slug}/guests`);
  },
);
