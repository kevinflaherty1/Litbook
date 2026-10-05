"use client";

import { useId, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createAssetUpload } from "@/features/portal/actions";
import { createClient } from "@/lib/supabase/client";
import { ASSET_SPECS, formatBytes, guessAssetType, type AssetKind } from "@/schemas/assets";

type Current = { fileName: string; size: number | null } | null;

/**
 * One requested file (logo, audio, media kit). Uploads straight to Storage
 * through a signed URL, then reports the path back to the form.
 */
export function AssetUploader({
  token,
  kind,
  existing,
  onChange,
  onUploadingChange,
}: {
  token: string;
  kind: AssetKind;
  existing: Current;
  /** A new upload, or null when the guest removes the file. */
  onChange: (file: { path: string; fileName: string } | null) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const spec = ASSET_SPECS[kind];
  const inputId = useId();
  const [current, setCurrent] = useState<Current>(existing);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setMessage(null);
    const contentType = guessAssetType(kind, file);
    if (!contentType) return setMessage(`That file type isn't supported. ${spec.hint}`);
    if (file.size > spec.maxBytes) return setMessage(`That file is too big. ${spec.hint}`);

    setUploading(true);
    onUploadingChange(true);
    try {
      const result = await createAssetUpload({ token, kind, contentType, size: file.size });
      if (!result.ok) return setMessage(result.error);
      const { error } = await createClient()
        .storage.from("guest-assets")
        .uploadToSignedUrl(result.data.path, result.data.uploadToken, file, { contentType });
      if (error) return setMessage("The upload didn't go through. Please try again.");
      setCurrent({ fileName: file.name, size: file.size });
      onChange({ path: result.data.path, fileName: file.name.slice(0, 200) });
    } catch {
      setMessage("The upload didn't go through. Please check your connection and try again.");
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <div className="grid gap-0.5">
        <span className="text-sm font-medium">{spec.label} (optional)</span>
        <span className="text-sm text-muted-foreground">{spec.description}</span>
      </div>
      {current && (
        <div className="flex items-center gap-2 text-sm">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{current.fileName}</span>
          {current.size !== null && (
            <span className="text-muted-foreground">{formatBytes(current.size)}</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${spec.label.toLowerCase()}`}
            disabled={uploading}
            onClick={() => {
              setCurrent(null);
              onChange(null);
            }}
          >
            <X />
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
          <label htmlFor={inputId} className="cursor-pointer">
            {uploading ? <Loader2 className="animate-spin" /> : <FileUp />}
            {uploading ? "Uploading…" : current ? "Replace file" : "Choose file"}
          </label>
        </Button>
        <span className="text-xs text-muted-foreground">{spec.hint}</span>
      </div>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        aria-label={spec.label}
        accept={[
          ...new Set([...Object.keys(spec.types), ...Object.values(spec.types).map((e) => `.${e}`)]),
        ].join(",")}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {message && <p className="text-sm text-destructive">{message}</p>}
    </div>
  );
}
