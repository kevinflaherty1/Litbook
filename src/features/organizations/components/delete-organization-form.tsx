"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteOrganization } from "@/features/organizations/actions";
import { handleActionResult } from "@/lib/forms";
import { deleteOrganizationSchema, type DeleteOrganizationInput } from "@/schemas/billing";

export function DeleteOrganizationForm({ orgId, slug }: { orgId: string; slug: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<DeleteOrganizationInput>({
    resolver: zodResolver(deleteOrganizationSchema),
    defaultValues: { orgId, confirmSlug: "" },
  });
  const typed = useWatch({ control: form.control, name: "confirmSlug" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      // Redirects to the dashboard on success.
      handleActionResult(form, await deleteOrganization(values));
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-lg gap-4" noValidate>
      <Field
        id="confirm-slug"
        label={
          <>
            Type <span className="font-mono">{slug}</span> to confirm
          </>
        }
        error={form.formState.errors.confirmSlug?.message}
      >
        <Input autoComplete="off" {...form.register("confirmSlug")} />
      </Field>
      <Button
        type="submit"
        variant="destructive"
        className="w-fit"
        disabled={isPending || typed.trim() !== slug}
      >
        {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Delete workspace
      </Button>
    </form>
  );
}
