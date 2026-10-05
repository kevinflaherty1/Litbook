"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moveCustomField, setCustomFieldArchived } from "@/features/custom-fields/actions";
import { CustomFieldDialog } from "@/features/custom-fields/components/custom-field-dialog";
import type { ActionResult } from "@/lib/action-result";
import { CUSTOM_FIELD_TYPE_LABELS, type CustomFieldType } from "@/schemas/custom-fields";

type Row = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: CustomFieldType;
  options: string[];
  required: boolean;
  archived_at: string | null;
};

export function CustomFieldsManager({
  orgId,
  fields,
  disabled,
  canAdd = true,
}: {
  orgId: string;
  fields: Row[];
  disabled: boolean;
  /** False when the plan doesn't include questions: existing ones can still be edited or archived. */
  canAdd?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const active = fields.filter((f) => !f.archived_at);
  const archived = fields.filter((f) => f.archived_at);

  const run = (action: () => Promise<ActionResult<unknown>>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
      else if (success) toast.success(success);
    });

  return (
    <div className="grid gap-4">
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No extra questions yet. Guests see the standard bio, headshot and links fields.
        </p>
      ) : (
        <ol className="grid divide-y rounded-md border" aria-label="Guest questions">
          {active.map((f, i) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="font-medium break-words">{f.label}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{CUSTOM_FIELD_TYPE_LABELS[f.field_type]}</Badge>
                  {f.required && <span>Required</span>}
                  {f.field_type === "select" && <span>{f.options.join(" · ")}</span>}
                </span>
              </div>
              {!disabled && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move "${f.label}" up`}
                    disabled={isPending || i === 0}
                    onClick={() => run(() => moveCustomField({ orgId, fieldId: f.id, direction: "up" }))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move "${f.label}" down`}
                    disabled={isPending || i === active.length - 1}
                    onClick={() => run(() => moveCustomField({ orgId, fieldId: f.id, direction: "down" }))}
                  >
                    <ArrowDown />
                  </Button>
                  <CustomFieldDialog
                    orgId={orgId}
                    field={f}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Edit "${f.label}"`}>
                        <Pencil />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Archive "${f.label}"`}
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => setCustomFieldArchived({ orgId, fieldId: f.id, archived: true }),
                        "Question archived. Past answers are kept.",
                      )
                    }
                  >
                    <Archive />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!disabled && canAdd && (
        <CustomFieldDialog
          orgId={orgId}
          trigger={
            <Button variant="outline" className="w-fit">
              <Plus /> Add question
            </Button>
          }
        />
      )}

      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Archived questions ({archived.length})
          </summary>
          <ul className="mt-2 grid gap-2">
            {archived.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <span className="flex-1 break-words text-muted-foreground">{f.label}</span>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => setCustomFieldArchived({ orgId, fieldId: f.id, archived: false }),
                        "Question restored",
                      )
                    }
                  >
                    <ArchiveRestore /> Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
