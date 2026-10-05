"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteAccount } from "@/features/account/actions";
import { handleActionResult } from "@/lib/forms";
import { deleteAccountSchema, type DeleteAccountInput } from "@/schemas/account";

export function DeleteAccountForm({ email, disabled }: { email: string; disabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<DeleteAccountInput>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { confirmEmail: "" },
  });
  const typed = useWatch({ control: form.control, name: "confirmEmail" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      // Redirects to the sign-in page on success.
      handleActionResult(form, await deleteAccount(values));
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-lg gap-4" noValidate>
      <Field
        id="confirm-email"
        label={
          <>
            Type <span className="font-mono">{email}</span> to confirm
          </>
        }
        error={form.formState.errors.confirmEmail?.message}
      >
        <Input autoComplete="off" disabled={disabled} {...form.register("confirmEmail")} />
      </Field>
      <Button
        type="submit"
        variant="destructive"
        className="w-fit"
        disabled={disabled || isPending || typed.trim().toLowerCase() !== email.toLowerCase()}
      >
        {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Delete my account
      </Button>
    </form>
  );
}
