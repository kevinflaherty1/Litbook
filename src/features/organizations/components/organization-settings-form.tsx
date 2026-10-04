"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrganization } from "@/features/organizations/actions";
import { env } from "@/lib/env";
import { handleActionResult } from "@/lib/forms";
import { updateOrganizationSchema, type UpdateOrganizationInput } from "@/schemas/organization";

export function OrganizationSettingsForm({
  org,
  disabled,
}: {
  org: { id: string; name: string; slug: string };
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: { orgId: org.id, name: org.name, slug: org.slug },
  });
  const slug = useWatch({ control: form.control, name: "slug" });
  const { errors, isDirty } = form.formState;
  const host = new URL(env.NEXT_PUBLIC_SITE_URL).host;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateOrganization(values);
      if (handleActionResult(form, result)) {
        form.reset(values);
        toast.success("Workspace updated");
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-lg gap-4" noValidate>
      <fieldset disabled={disabled || isPending} className="grid gap-4">
        <Field id="org-name" label="Name" error={errors.name?.message}>
          <Input {...form.register("name")} />
        </Field>
        <Field
          id="org-slug"
          label="Workspace URL"
          description={`${host}/${slug}. Changing this breaks existing bookmarks.`}
          error={errors.slug?.message}
        >
          <Input {...form.register("slug")} />
        </Field>
      </fieldset>
      {!disabled && (
        <Button type="submit" className="w-fit" disabled={!isDirty || isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      )}
    </form>
  );
}
