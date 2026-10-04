import { CopyButton } from "@/components/shared/copy-button";

/** A labelled block of guest content with a copy button. */
export function CopyableText({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {value && <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />}
      </div>
      {value ? (
        <p className={multiline ? "text-sm whitespace-pre-wrap" : "text-sm"}>{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Not provided</p>
      )}
    </div>
  );
}
