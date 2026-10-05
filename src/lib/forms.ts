import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/action-result";

/**
 * Surfaces a failed ActionResult in a react-hook-form form: field errors go
 * next to their inputs, anything else becomes a toast. Returns true on success.
 */
export function handleActionResult<T extends FieldValues, R>(
  form: UseFormReturn<T>,
  result: ActionResult<R>,
): result is { ok: true; data: R } {
  if (result.ok) return true;

  let placed = false;
  for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
    if (!messages?.length) continue;
    // Nested keys like "customAnswers.<id>" belong to a top-level form value.
    if (field.split(".")[0] in form.getValues()) {
      form.setError(field as Path<T>, { message: messages[0] });
      placed = true;
    }
  }
  if (!placed) toast.error(result.error);
  return false;
}
