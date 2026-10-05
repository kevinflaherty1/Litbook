"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { updateRequestedAssets } from "@/features/organizations/actions";
import { ASSET_KINDS, ASSET_SPECS, type AssetKind } from "@/schemas/assets";

/** Which extra files the guest page asks for. Saved as soon as a box changes. */
export function RequestedAssetsForm({
  orgId,
  requested,
  disabled,
}: {
  orgId: string;
  requested: AssetKind[];
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [kinds, setKinds] = useOptimistic(requested);

  return (
    <fieldset className="grid gap-3" disabled={disabled || isPending}>
      <legend className="sr-only">Files to request</legend>
      {ASSET_KINDS.map((kind) => (
        <label key={kind} className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={kinds.includes(kind)}
            onChange={(e) => {
              const next = e.target.checked ? [...kinds, kind] : kinds.filter((k) => k !== kind);
              startTransition(async () => {
                setKinds(next);
                const result = await updateRequestedAssets({ orgId, kinds: next });
                if (result.ok) toast.success("Requested files updated");
                else toast.error(result.error);
              });
            }}
          />
          <span className="grid gap-0.5">
            <span className="font-medium">{ASSET_SPECS[kind].label}</span>
            <span className="text-muted-foreground">
              {ASSET_SPECS[kind].description} {ASSET_SPECS[kind].hint}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
