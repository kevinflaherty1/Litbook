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
import { updateSubmissionContent } from "@/features/bookings/actions";
import { handleActionResult } from "@/lib/forms";
import { SOCIAL_PLATFORMS, submissionContentSchema, type SubmissionContentInput } from "@/schemas/portal";

type Content = {
  display_name: string | null;
  headline: string | null;
  short_bio: string | null;
  long_bio: string | null;
  pronouns: string | null;
  name_pronunciation: string | null;
  website_url: string | null;
  social_links: unknown;
};

/** Lets the host correct the guest's content. The signed release isn't editable. */
export function SubmissionContentForm({
  orgId,
  bookingId,
  content,
}: {
  orgId: string;
  bookingId: string;
  content: Content;
}) {
  const [isPending, startTransition] = useTransition();
  const links = (content.social_links ?? {}) as Record<string, string>;
  const form = useForm<SubmissionContentInput>({
    resolver: zodResolver(submissionContentSchema, undefined, { raw: true }),
    defaultValues: {
      orgId,
      bookingId,
      displayName: content.display_name ?? "",
      headline: content.headline ?? "",
      shortBio: content.short_bio ?? "",
      longBio: content.long_bio ?? "",
      pronouns: content.pronouns ?? "",
      namePronunciation: content.name_pronunciation ?? "",
      websiteUrl: content.website_url ?? "",
      socialLinks: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, links[p.key] ?? ""])),
    },
  });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (!handleActionResult(form, await updateSubmissionContent(values))) return;
      form.reset(values);
      toast.success("Guest details saved");
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <fieldset disabled={isPending} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="edit-display-name" label="Name" error={errors.displayName?.message}>
            <Input {...form.register("displayName")} />
          </Field>
          <Field id="edit-headline" label="Headline" error={errors.headline?.message}>
            <Input {...form.register("headline")} />
          </Field>
          <Field id="edit-pronouns" label="Pronouns" error={errors.pronouns?.message}>
            <Input {...form.register("pronouns")} />
          </Field>
          <Field id="edit-pronunciation" label="Pronunciation" error={errors.namePronunciation?.message}>
            <Input {...form.register("namePronunciation")} />
          </Field>
        </div>
        <Field id="edit-short-bio" label="Short bio" error={errors.shortBio?.message}>
          <Textarea rows={3} {...form.register("shortBio")} />
        </Field>
        <Field id="edit-long-bio" label="Long bio" error={errors.longBio?.message}>
          <Textarea rows={6} {...form.register("longBio")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="edit-website"
            label="Website"
            error={errors.websiteUrl?.message}
            className="sm:col-span-2"
          >
            <Input {...form.register("websiteUrl")} />
          </Field>
          {SOCIAL_PLATFORMS.map((p) => (
            <Field
              key={p.key}
              id={`edit-social-${p.key}`}
              label={p.label}
              error={errors.socialLinks?.[p.key]?.message}
            >
              <Input {...form.register(`socialLinks.${p.key}`)} />
            </Field>
          ))}
        </div>
      </fieldset>
      <Button type="submit" className="w-fit" disabled={isPending || !isDirty}>
        {isPending && <Loader2 className="animate-spin" />}
        Save changes
      </Button>
    </form>
  );
}
