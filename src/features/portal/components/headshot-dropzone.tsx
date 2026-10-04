"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImageUp, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createHeadshotUpload } from "@/features/portal/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { HEADSHOT_MAX_BYTES, HEADSHOT_TYPES } from "@/schemas/portal";

type Props = {
  token: string;
  /** Preview of a headshot uploaded on a previous visit. */
  existingUrl: string | null;
  onUploaded: (path: string) => void;
  onUploadingChange: (uploading: boolean) => void;
  error?: string;
};

/**
 * Picks an image, checks it in the browser, then uploads it straight to
 * Storage through a signed URL minted by the server. The file never passes
 * through our server.
 */
export function HeadshotDropzone({ token, existingUrl, onUploaded, onUploadingChange, error }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl);
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Release object URLs we created.
  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function upload(file: File) {
    setMessage(null);
    if (!(HEADSHOT_TYPES as readonly string[]).includes(file.type)) {
      setMessage("Please choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > HEADSHOT_MAX_BYTES) {
      setMessage("That image is over 10 MB. Please choose a smaller one.");
      return;
    }

    setStatus("uploading");
    onUploadingChange(true);
    try {
      const result = await createHeadshotUpload({
        token,
        contentType: file.type as (typeof HEADSHOT_TYPES)[number],
        size: file.size,
      });
      if (!result.ok) {
        setMessage(result.error);
        setStatus("idle");
        return;
      }
      const { error: uploadError } = await createClient()
        .storage.from("guest-assets")
        .uploadToSignedUrl(result.data.path, result.data.uploadToken, file, { contentType: file.type });
      if (uploadError) {
        setMessage("The upload didn't go through. Please try again.");
        setStatus("idle");
        return;
      }
      setPreview(URL.createObjectURL(file));
      setStatus("done");
      onUploaded(result.data.path);
    } catch {
      setMessage("The upload didn't go through. Please check your connection and try again.");
      setStatus("idle");
    } finally {
      onUploadingChange(false);
    }
  }

  const shownError = message ?? error;
  return (
    <div className="grid gap-2">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:bg-accent/50",
          dragging && "border-primary bg-accent/50",
          shownError && "border-destructive",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: and signed URLs; next/image adds nothing here
          <img src={preview} alt="Your headshot" className="size-32 rounded-lg object-cover" />
        ) : (
          <ImageUp className="size-8 text-muted-foreground" />
        )}
        <div className="grid gap-1">
          <span className="font-medium">
            {status === "uploading" ? "Uploading…" : preview ? "Looking good!" : "Add your headshot"}
          </span>
          <span className="text-sm text-muted-foreground">
            {preview ? "Tap to choose a different photo." : "Tap to choose a photo, or drag one here."} JPG,
            PNG or WebP, up to 10 MB.
          </span>
        </div>
        {status === "uploading" ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {preview ? <RefreshCw /> : <ImageUp />}
            {preview ? "Replace photo" : "Choose photo"}
          </Button>
        )}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={HEADSHOT_TYPES.join(",")}
        className="sr-only"
        aria-label="Headshot"
        aria-invalid={shownError ? true : undefined}
        disabled={status === "uploading"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {shownError && <p className="text-sm text-destructive">{shownError}</p>}
    </div>
  );
}
