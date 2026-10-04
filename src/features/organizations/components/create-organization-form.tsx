"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createOrganization } from "@/features/organizations/actions";
import { env } from "@/lib/env";
import { handleActionResult } from "@/lib/forms";
import { createOrganizationSchema, slugify, type CreateOrganizationInput } from "@/schemas/organization";

export function CreateOrganizationForm() {
  const [isPending, startTransition] = useTransition();
  // Auto-fill the slug from the name until the user edits it themselves.
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "", slug: "" },
  });
  const slug = useWatch({ control: form.control, name: "slug" });
  const { errors } = form.formState;
  const host = new URL(env.NEXT_PUBLIC_SITE_URL).host;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      // Redirects to the new org on success.
      handleActionResult(form, await createOrganization(values));
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field id="name" label="Show or company name" error={errors.name?.message}>
        <Input
          placeholder="The Daily Grind"
          autoFocus
          {...form.register("name", {
            onChange: (e) => {
              if (!slugTouched) form.setValue("slug", slugify(e.target.value));
            },
          })}
        />
      </Field>
      <Field
        id="slug"
        label="Workspace URL"
        description={`${host}/${slug || "your-show"}`}
        error={errors.slug?.message}
      >
        <Input
          placeholder="the-daily-grind"
          {...form.register("slug", { onChange: () => setSlugTouched(true) })}
        />
      </Field>
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="animate-spin" />}
        Create workspace
      </Button>
    </form>
  );
}
