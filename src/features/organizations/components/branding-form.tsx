"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateBranding } from "@/features/organizations/actions";
import { brandStyle, logoPublicUrl } from "@/lib/branding";
import { handleActionResult } from "@/lib/forms";
import { createClient } from "@/lib/supabase/client";
import {
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  updateBrandingSchema,
  type UpdateBrandingInput,
} from "@/schemas/organization";

const EXTENSIONS: Record<(typeof LOGO_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function BrandingForm({
  org,
  disabled,
}: {
  org: {
    id: string;
    name: string;
    logo_path: string | null;
    brand_color: string | null;
    portal_welcome: string | null;
  };
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(logoPublicUrl(org.logo_path));
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<UpdateBrandingInput>({
    resolver: zodResolver(updateBrandingSchema, undefined, { raw: true }),
    defaultValues: {
      orgId: org.id,
      logoPath: "",
      removeLogo: false,
      brandColor: org.brand_color ?? "",
      portalWelcome: org.portal_welcome ?? "",
    },
  });
  const { errors, isDirty } = form.formState;
  const color = useWatch({ control: form.control, name: "brandColor" }) ?? "";
  const validColor = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function uploadLogo(file: File) {
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Please choose a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Logos must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const path = `${org.id}/logo-${crypto.randomUUID()}.${EXTENSIONS[file.type as (typeof LOGO_TYPES)[number]]}`;
      const { error } = await createClient()
        .storage.from("org-branding")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (error) {
        toast.error("The upload didn't go through. Please try again.");
        return;
      }
      setPreview(URL.createObjectURL(file));
      form.setValue("logoPath", path, { shouldDirty: true });
      form.setValue("removeLogo", false, { shouldDirty: true });
    } finally {
      setUploading(false);
    }
  }

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateBranding(values);
      if (handleActionResult(form, result)) {
        form.reset({ ...values, logoPath: "", removeLogo: false });
        toast.success("Guest page updated");
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_18rem]" noValidate>
      <fieldset disabled={disabled || isPending} className="grid content-start gap-4">
        <div className="grid gap-2">
          <span className="text-sm font-medium">Logo</span>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob: and Storage URLs
                <img src={preview} alt={`${org.name} logo`} className="size-full object-contain" />
              ) : (
                <ImageUp className="size-6 text-muted-foreground" />
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" /> : <ImageUp />}
              {preview ? "Replace logo" : "Upload logo"}
            </Button>
            {preview && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPreview(null);
                  form.setValue("logoPath", "", { shouldDirty: true });
                  form.setValue("removeLogo", true, { shouldDirty: true });
                }}
              >
                <Trash2 /> Remove
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="sr-only"
              aria-label="Logo file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadLogo(file);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            PNG, JPG or WebP, up to 2 MB. Shown at the top of the guest page.
          </p>
        </div>

        <Field
          id="brand-color"
          label="Brand colour"
          description="Used for buttons on the guest page. Leave empty for the default."
          error={errors.brandColor?.message}
        >
          {(props) => (
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick brand colour"
                className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
                value={validColor ?? "#000000"}
                onChange={(e) => form.setValue("brandColor", e.target.value, { shouldDirty: true })}
              />
              <Input
                placeholder="#4f46e5"
                className="max-w-36 font-mono"
                {...props}
                {...form.register("brandColor")}
              />
            </div>
          )}
        </Field>

        <Field
          id="portal-welcome"
          label="Welcome message"
          description="Optional. Shown to every guest above the form, e.g. what to expect on the show."
          error={errors.portalWelcome?.message}
        >
          <Textarea rows={4} {...form.register("portalWelcome")} />
        </Field>

        {!disabled && (
          <Button type="submit" className="w-fit" disabled={!isDirty || isPending || uploading}>
            {isPending && <Loader2 className="animate-spin" />}
            Save guest page
          </Button>
        )}
      </fieldset>

      <div className="grid content-start gap-2">
        <span className="text-sm font-medium">Preview</span>
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-4" style={brandStyle(validColor)}>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- blob: and Storage URLs
            <img src={preview} alt="" className="h-10 w-fit max-w-40 object-contain" />
          )}
          <p className="text-xs text-muted-foreground">{org.name}</p>
          <p className="font-semibold">Hi Ada, welcome to the show</p>
          <span className="inline-flex h-8 w-fit items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Send to my host
          </span>
        </div>
      </div>
    </form>
  );
}
