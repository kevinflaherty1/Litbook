"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/features/team/actions";
import { handleActionResult } from "@/lib/forms";
import { updateProfileSchema } from "@/schemas/team";

type Values = z.input<typeof updateProfileSchema>;

export function ProfileForm({ fullName, email }: { fullName: string; email: string | null }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName },
  });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (handleActionResult(form, await updateProfile(values))) {
        form.reset(values);
        toast.success("Profile updated");
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-lg gap-4" noValidate>
      <Field id="profile-name" label="Your name" error={errors.fullName?.message}>
        <Input autoComplete="name" {...form.register("fullName")} />
      </Field>
      <Field id="profile-email" label="Email" description="You sign in with this address.">
        <Input value={email ?? ""} disabled readOnly />
      </Field>
      <Button type="submit" className="w-fit" disabled={!isDirty || isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Save
      </Button>
    </form>
  );
}
