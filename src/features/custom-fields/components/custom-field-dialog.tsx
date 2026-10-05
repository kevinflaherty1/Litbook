"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createCustomField, updateCustomField } from "@/features/custom-fields/actions";
import { handleActionResult } from "@/lib/forms";
import {
  CUSTOM_FIELD_TYPE_LABELS,
  CUSTOM_FIELD_TYPES,
  createCustomFieldSchema,
  type CreateCustomFieldInput,
  type CustomFieldType,
} from "@/schemas/custom-fields";

type Existing = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: CustomFieldType;
  options: string[];
  required: boolean;
};

/** Adds a question, or edits one (its type is fixed once created). */
export function CustomFieldDialog({
  orgId,
  field,
  trigger,
}: {
  orgId: string;
  field?: Existing;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaults: CreateCustomFieldInput = {
    orgId,
    fieldType: field?.field_type ?? "short_text",
    label: field?.label ?? "",
    helpText: field?.help_text ?? "",
    required: field?.required ?? false,
    options: field?.options.join("\n") ?? "",
  };
  const form = useForm<CreateCustomFieldInput>({
    resolver: zodResolver(createCustomFieldSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const fieldType = useWatch({ control: form.control, name: "fieldType" });
  const idPrefix = field ? `edit-${field.id}` : "new-field";

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = field
        ? await updateCustomField({ ...values, fieldId: field.id })
        : await createCustomField(values);
      if (handleActionResult(form, result)) {
        toast.success(field ? "Question updated" : "Question added");
        setOpen(false);
        if (!field) form.reset(defaults);
      }
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{field ? "Edit question" : "Add a question"}</DialogTitle>
          <DialogDescription>Guests answer it on their onboarding page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field id={`${idPrefix}-label`} label="Question" error={errors.label?.message}>
            <Input placeholder="What would you like to promote?" {...form.register("label")} />
          </Field>
          <Field
            id={`${idPrefix}-type`}
            label="Answer type"
            description={field ? "The answer type can't be changed after a question is created." : undefined}
          >
            <NativeSelect disabled={!!field} {...form.register("fieldType")}>
              {CUSTOM_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CUSTOM_FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {fieldType === "select" && (
            <Field
              id={`${idPrefix}-options`}
              label="Options"
              description="One per line."
              error={errors.options?.message}
            >
              <Textarea rows={4} {...form.register("options")} />
            </Field>
          )}
          <Field
            id={`${idPrefix}-help`}
            label="Help text"
            description="Optional."
            error={errors.helpText?.message}
          >
            <Input {...form.register("helpText")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" {...form.register("required")} />
            Required
          </label>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" />}
              {field ? "Save question" : "Add question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
