"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createGuest, updateGuest } from "@/features/guests/actions";
import { handleActionResult } from "@/lib/forms";
import { createGuestSchema, type CreateGuestInput } from "@/schemas/guest";

type Guest = { id: string; full_name: string; email: string | null; internal_notes: string | null };

/** Add a guest to the directory (no `guest`) or edit one. */
export function GuestForm({ orgId, guest }: { orgId: string; guest?: Guest }) {
  const [isPending, startTransition] = useTransition();
  const empty: CreateGuestInput = { orgId, fullName: "", email: "", internalNotes: "" };
  const form = useForm<CreateGuestInput>({
    resolver: zodResolver(createGuestSchema, undefined, { raw: true }),
    defaultValues: guest
      ? {
          orgId,
          fullName: guest.full_name,
          email: guest.email ?? "",
          internalNotes: guest.internal_notes ?? "",
        }
      : empty,
  });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (guest) {
        const result = await updateGuest({ ...values, guestId: guest.id });
        if (!handleActionResult(form, result)) return;
        form.reset(values);
        toast.success("Guest saved");
      } else {
        const result = await createGuest(values);
        if (!handleActionResult(form, result)) return;
        form.reset(empty);
        toast.success(`${values.fullName.trim()} added to your directory`);
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <fieldset disabled={isPending} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="guest-name" label="Name" error={errors.fullName?.message}>
            <Input placeholder="Ada Lovelace" {...form.register("fullName")} />
          </Field>
          <Field id="guest-email" label="Email" description="Optional." error={errors.email?.message}>
            <Input type="email" placeholder="ada@example.com" {...form.register("email")} />
          </Field>
        </div>
        <Field
          id="guest-notes"
          label="Internal notes"
          description="Only your team sees these. Never shown to the guest."
          error={errors.internalNotes?.message}
        >
          <Textarea
            rows={3}
            placeholder="How you met, topics to cover…"
            {...form.register("internalNotes")}
          />
        </Field>
      </fieldset>
      <Button type="submit" className="w-fit" disabled={isPending || (guest && !isDirty)}>
        {isPending && <Loader2 className="animate-spin" />}
        {guest ? "Save changes" : "Add guest"}
      </Button>
    </form>
  );
}
