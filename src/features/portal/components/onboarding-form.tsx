"use client";

import { useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch, type Resolver } from "react-hook-form";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitOnboarding } from "@/features/portal/actions";
import { AssetUploader } from "@/features/portal/components/asset-uploader";
import { HeadshotDropzone } from "@/features/portal/components/headshot-dropzone";
import { handleActionResult } from "@/lib/forms";
import { cn } from "@/lib/utils";
import type { AssetKind } from "@/schemas/assets";
import { customAnswersSchema, type CustomField } from "@/schemas/custom-fields";
import {
  onboardingSubmissionSchema,
  SOCIAL_PLATFORMS,
  type OnboardingSubmissionInput,
} from "@/schemas/portal";

type Existing = {
  display_name: string | null;
  headline: string | null;
  short_bio: string | null;
  long_bio: string | null;
  pronouns: string | null;
  name_pronunciation: string | null;
  website_url: string | null;
  social_links: Record<string, string>;
  custom_answers: Record<string, string | boolean>;
} | null;

export function OnboardingForm({
  token,
  guestName,
  releaseText,
  existing,
  headshotPreviewUrl,
  customFields,
  requestedAssets,
  existingAssets,
}: {
  token: string;
  guestName: string;
  releaseText: string;
  existing: Existing;
  headshotPreviewUrl: string | null;
  customFields: CustomField[];
  requestedAssets: AssetKind[];
  existingAssets: { kind: AssetKind; file_name: string; size_bytes: number }[];
}) {
  const [isPending, startTransition] = useTransition();
  // Counts uploads in flight across the headshot and file pickers.
  const [uploads, setUploads] = useState(0);
  const uploading = uploads > 0;
  const setUploading = (active: boolean) => setUploads((n) => Math.max(0, n + (active ? 1 : -1)));
  const schema = useMemo(
    () => onboardingSubmissionSchema.extend({ customAnswers: customAnswersSchema(customFields) }),
    [customFields],
  );
  const form = useForm<OnboardingSubmissionInput>({
    // The questions are only known at runtime; the static input type covers them as a record.
    resolver: zodResolver(schema, undefined, { raw: true }) as unknown as Resolver<OnboardingSubmissionInput>,
    defaultValues: {
      token,
      displayName: existing?.display_name ?? guestName,
      headline: existing?.headline ?? "",
      shortBio: existing?.short_bio ?? "",
      longBio: existing?.long_bio ?? "",
      pronouns: existing?.pronouns ?? "",
      namePronunciation: existing?.name_pronunciation ?? "",
      websiteUrl: existing?.website_url ?? "",
      socialLinks: Object.fromEntries(
        SOCIAL_PLATFORMS.map((p) => [p.key, existing?.social_links[p.key] ?? ""]),
      ),
      headshotPath: "",
      customAnswers: Object.fromEntries(
        customFields.map((f) => {
          const previous = existing?.custom_answers[f.id];
          return [
            f.id,
            f.field_type === "checkbox" ? previous === true : typeof previous === "string" ? previous : "",
          ];
        }),
      ),
      assets: {},
      releaseAccepted: false,
      releaseSignedName: "",
    },
  });
  const { errors } = form.formState;
  const shortBio = useWatch({ control: form.control, name: "shortBio" }) ?? "";

  const onSubmit = form.handleSubmit(
    (values) =>
      startTransition(async () => {
        // Redirects to the thank-you page on success.
        handleActionResult(form, await submitOnboarding(values));
      }),
    // Bring the first problem into view on small screens.
    () => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>About you</CardTitle>
          <CardDescription>How we&apos;ll introduce you on the show.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field
            id="display-name"
            label="Name"
            description="As it should appear in show notes."
            error={errors.displayName?.message}
          >
            <Input autoComplete="name" {...form.register("displayName")} />
          </Field>
          <Field
            id="headline"
            label="Headline"
            description='A few words, like "Founder of Acme" or "Author of The Big Book".'
            error={errors.headline?.message}
          >
            <Input {...form.register("headline")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pronouns" label="Pronouns" description="Optional." error={errors.pronouns?.message}>
              <Input placeholder="she/her" {...form.register("pronouns")} />
            </Field>
            <Field
              id="pronunciation"
              label="How to say your name"
              description="Optional."
              error={errors.namePronunciation?.message}
            >
              <Input placeholder="AY-duh LUV-lace" {...form.register("namePronunciation")} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bio</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field
            id="short-bio"
            label="Short bio"
            description={
              <span className={cn(shortBio.length > 300 && "text-destructive")}>
                One or two sentences for the episode description. {shortBio.length}/300
              </span>
            }
            error={errors.shortBio?.message}
          >
            <Textarea rows={3} {...form.register("shortBio")} />
          </Field>
          <Field
            id="long-bio"
            label="Longer bio"
            description="Optional. Used for the intro and the episode page."
            error={errors.longBio?.message}
          >
            <Textarea rows={6} {...form.register("longBio")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Headshot</CardTitle>
          <CardDescription>A clear, well-lit photo of you. Square crops work best.</CardDescription>
        </CardHeader>
        <CardContent>
          <HeadshotDropzone
            token={token}
            existingUrl={headshotPreviewUrl}
            onUploaded={(path) => {
              form.setValue("headshotPath", path);
              form.clearErrors("headshotPath");
            }}
            onUploadingChange={setUploading}
            error={errors.headshotPath?.message}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
          <CardDescription>All optional. Handles or full links both work.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="website" label="Website" error={errors.websiteUrl?.message} className="sm:col-span-2">
            <Input
              inputMode="url"
              autoComplete="url"
              placeholder="yourname.com"
              {...form.register("websiteUrl")}
            />
          </Field>
          {SOCIAL_PLATFORMS.map((p) => (
            <Field
              key={p.key}
              id={`social-${p.key}`}
              label={p.label}
              error={errors.socialLinks?.[p.key]?.message}
            >
              <Input
                placeholder={p.placeholder}
                autoCapitalize="none"
                {...form.register(`socialLinks.${p.key}`)}
              />
            </Field>
          ))}
        </CardContent>
      </Card>

      {requestedAssets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
            <CardDescription>Your host asked for these. All optional.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {requestedAssets.map((kind) => {
              const previous = existingAssets.find((a) => a.kind === kind);
              return (
                <AssetUploader
                  key={kind}
                  token={token}
                  kind={kind}
                  existing={previous ? { fileName: previous.file_name, size: previous.size_bytes } : null}
                  onUploadingChange={setUploading}
                  onChange={(file) =>
                    form.setValue(
                      "assets",
                      { ...form.getValues("assets"), [kind]: file },
                      { shouldDirty: true },
                    )
                  }
                />
              );
            })}
          </CardContent>
        </Card>
      )}

      {customFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>A few more questions</CardTitle>
            <CardDescription>From your host, to help them prepare.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {customFields.map((f) => {
              const error = (errors.customAnswers as Record<string, { message?: string }> | undefined)?.[f.id]
                ?.message;
              const label = f.required ? f.label : `${f.label} (optional)`;
              const name = `customAnswers.${f.id}` as const;
              if (f.field_type === "checkbox") {
                return (
                  <div key={f.id} className="grid gap-1">
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-primary"
                        aria-invalid={error ? true : undefined}
                        {...form.register(name)}
                      />
                      <span className="grid gap-1">
                        <span>{label}</span>
                        {f.help_text && <span className="text-muted-foreground">{f.help_text}</span>}
                      </span>
                    </label>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                  </div>
                );
              }
              return (
                <Field
                  key={f.id}
                  id={`question-${f.id}`}
                  label={label}
                  description={f.help_text ?? undefined}
                  error={error}
                >
                  {f.field_type === "long_text" ? (
                    <Textarea rows={4} {...form.register(name)} />
                  ) : f.field_type === "select" ? (
                    <NativeSelect {...form.register(name)}>
                      <option value="">Choose…</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      {...(f.field_type === "url"
                        ? { inputMode: "url" as const, autoCapitalize: "none" }
                        : {})}
                      {...form.register(name)}
                    />
                  )}
                </Field>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Guest release</CardTitle>
          <CardDescription>Please read and sign before your recording.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div
            className="max-h-64 overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm whitespace-pre-wrap"
            tabIndex={0}
            aria-label="Release text"
          >
            {releaseText}
          </div>
          <div className="grid gap-2">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                aria-invalid={errors.releaseAccepted ? true : undefined}
                {...form.register("releaseAccepted")}
              />
              <span>I have read and agree to the release above.</span>
            </label>
            {errors.releaseAccepted && (
              <p className="text-sm text-destructive">{errors.releaseAccepted.message}</p>
            )}
          </div>
          <Field
            id="signed-name"
            label="Type your full name to sign"
            description="This counts as your signature. We record the date and time."
            error={errors.releaseSignedName?.message}
          >
            <Input
              autoComplete="name"
              className="font-medium italic"
              {...form.register("releaseSignedName")}
            />
          </Field>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={isPending || uploading}>
        {isPending && <Loader2 className="animate-spin" />}
        {existing ? "Save my updates" : "Send to my host"}
      </Button>
    </form>
  );
}
