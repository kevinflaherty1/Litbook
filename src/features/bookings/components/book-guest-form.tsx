"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bookExistingGuest, bookNewGuest } from "@/features/bookings/actions";
import { handleActionResult } from "@/lib/forms";
import {
  bookExistingGuestSchema,
  bookNewGuestSchema,
  type BookExistingGuestInput,
  type BookNewGuestInput,
} from "@/schemas/booking";

type GuestOption = { id: string; full_name: string; email: string | null };

export function BookGuestForm({
  orgId,
  episodeId,
  guests,
}: {
  orgId: string;
  episodeId: string;
  /** Directory guests not already on this episode. */
  guests: GuestOption[];
}) {
  return (
    <div className="grid gap-6">
      {guests.length > 0 && <BookExisting orgId={orgId} episodeId={episodeId} guests={guests} />}
      <BookNew orgId={orgId} episodeId={episodeId} hasDirectory={guests.length > 0} />
    </div>
  );
}

function BookExisting({
  orgId,
  episodeId,
  guests,
}: {
  orgId: string;
  episodeId: string;
  guests: GuestOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<BookExistingGuestInput>({
    resolver: zodResolver(bookExistingGuestSchema),
    defaultValues: { orgId, episodeId, guestId: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await bookExistingGuest(values);
      if (!handleActionResult(form, result)) return;
      const name = guests.find((g) => g.id === values.guestId)?.full_name ?? "Guest";
      toast.success(`${name} booked`);
      form.reset({ orgId, episodeId, guestId: "" });
    }),
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-3" noValidate>
      <Field
        id="book-existing-guest"
        label="From your guest directory"
        error={form.formState.errors.guestId?.message}
        className="min-w-56 flex-1"
      >
        {(props) => (
          <Controller
            control={form.control}
            name="guestId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full" {...props}>
                  <SelectValue placeholder="Choose a guest" />
                </SelectTrigger>
                <SelectContent>
                  {guests.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.full_name}
                      {g.email && <span className="text-muted-foreground">{g.email}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}
      </Field>
      <Button type="submit" variant="secondary" className="mt-[1.375rem]" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Book guest
      </Button>
    </form>
  );
}

function BookNew({
  orgId,
  episodeId,
  hasDirectory,
}: {
  orgId: string;
  episodeId: string;
  hasDirectory: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<BookNewGuestInput>({
    resolver: zodResolver(bookNewGuestSchema, undefined, { raw: true }),
    defaultValues: { orgId, episodeId, fullName: "", email: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await bookNewGuest(values);
      if (!handleActionResult(form, result)) return;
      toast.success(
        result.data.reused
          ? `${result.data.guestName} was already in your directory and is now booked`
          : `${result.data.guestName} added and booked`,
      );
      form.reset({ orgId, episodeId, fullName: "", email: "" });
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-3" noValidate>
      <p className="text-sm font-medium">{hasDirectory ? "Or add someone new" : "Add a guest"}</p>
      <div className="flex flex-wrap items-start gap-3">
        <Field id="book-new-name" label="Name" error={errors.fullName?.message} className="min-w-48 flex-1">
          <Input placeholder="Ada Lovelace" {...form.register("fullName")} />
        </Field>
        <Field
          id="book-new-email"
          label="Email (optional)"
          error={errors.email?.message}
          className="min-w-56 flex-1"
        >
          <Input type="email" placeholder="ada@example.com" {...form.register("email")} />
        </Field>
        <Button type="submit" className="mt-[1.375rem]" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Add and book
        </Button>
      </div>
    </form>
  );
}
