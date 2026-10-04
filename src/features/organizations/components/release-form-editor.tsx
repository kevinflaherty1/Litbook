"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateReleaseForm } from "@/features/organizations/actions";
import { handleActionResult } from "@/lib/forms";
import { updateReleaseFormSchema, type UpdateReleaseFormInput } from "@/schemas/organization";

export function ReleaseFormEditor({
  orgId,
  text,
  version,
  disabled,
}: {
  orgId: string;
  text: string;
  version: number;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<UpdateReleaseFormInput>({
    resolver: zodResolver(updateReleaseFormSchema),
    defaultValues: { orgId, releaseFormText: text },
  });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateReleaseForm(values);
      if (handleActionResult(form, result)) {
        form.reset(values);
        toast.success(`Release form saved as version ${result.data.version}`);
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field
        id="release-form-text"
        label={`Release form text (version ${version})`}
        description="Guests agree to this exact wording. Each signature records the version it was signed against; saving changes creates a new version."
        error={errors.releaseFormText?.message}
      >
        <Textarea rows={8} disabled={disabled || isPending} {...form.register("releaseFormText")} />
      </Field>
      {!disabled && (
        <Button type="submit" className="w-fit" disabled={!isDirty || isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save new version
        </Button>
      )}
    </form>
  );
}
