"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { CopyButton } from "@/components/shared/copy-button";
import { Field } from "@/components/shared/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteMember } from "@/features/team/actions";
import { handleActionResult } from "@/lib/forms";
import { inviteMemberSchema, type InviteMemberInput } from "@/schemas/team";

export function InviteMemberForm({ orgId }: { orgId: string }) {
  const [isPending, startTransition] = useTransition();
  const [lastInvite, setLastInvite] = useState<{ email: string; url: string; emailed: boolean } | null>(null);
  const form = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { orgId, email: "", role: "member" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await inviteMember(values);
      if (!handleActionResult(form, result)) return;
      setLastInvite({ email: values.email, url: result.data.inviteUrl, emailed: result.data.emailed });
      form.reset({ orgId, email: "", role: values.role });
      if (result.data.emailed) toast.success(`Invitation sent to ${values.email}`);
    }),
  );

  return (
    <div className="grid gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-3" noValidate>
        <Field id="invite-email" label="Email" error={errors.email?.message} className="min-w-56 flex-1">
          <Input type="email" placeholder="producer@yourshow.com" {...form.register("email")} />
        </Field>
        <Field id="invite-role" label="Role" error={errors.role?.message}>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Button type="submit" className="mt-[1.375rem]" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          Send invite
        </Button>
      </form>

      {lastInvite && (
        <Alert>
          <MailCheck />
          <AlertTitle className="line-clamp-none">
            {lastInvite.emailed
              ? `Invitation emailed to ${lastInvite.email}`
              : `Invitation created for ${lastInvite.email}`}
          </AlertTitle>
          <AlertDescription className="min-w-0">
            <p>
              {lastInvite.emailed
                ? "You can also share this link directly. For security, it won't be shown again."
                : "Email isn't configured, so share this link with them. For security, it won't be shown again."}
            </p>
            <div className="flex w-full flex-wrap items-center gap-2">
              <code
                className="min-w-0 flex-1 basis-56 rounded bg-muted px-2 py-1 text-xs break-all"
                data-testid="invite-url"
              >
                {lastInvite.url}
              </code>
              <CopyButton value={lastInvite.url} label="Copy link" />
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
