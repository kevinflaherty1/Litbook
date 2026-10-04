"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { DateTimeInput } from "@/components/shared/date-time-input";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createEpisode, updateEpisode } from "@/features/episodes/actions";
import { handleActionResult } from "@/lib/forms";
import {
  createEpisodeSchema,
  EPISODE_STATUS_LABEL,
  EPISODE_STATUSES,
  type CreateEpisodeInput,
} from "@/schemas/episode";

type Episode = {
  id: string;
  title: string;
  description: string | null;
  episode_number: number | null;
  status: CreateEpisodeInput["status"];
  recording_at: string | null;
  publish_at: string | null;
};

/** Create (no `episode`) or edit an episode. */
export function EpisodeForm({ orgId, episode }: { orgId: string; episode?: Episode }) {
  const [isPending, startTransition] = useTransition();
  const isEdit = !!episode;
  const form = useForm<CreateEpisodeInput>({
    resolver: zodResolver(createEpisodeSchema, undefined, { raw: true }),
    defaultValues: {
      orgId,
      title: episode?.title ?? "",
      description: episode?.description ?? "",
      episodeNumber: episode?.episode_number?.toString() ?? "",
      status: episode?.status ?? "draft",
      recordingAt: episode?.recording_at ?? "",
      publishAt: episode?.publish_at ?? "",
    },
  });
  const { errors, isDirty } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (episode) {
        const result = await updateEpisode({ ...values, episodeId: episode.id });
        if (handleActionResult(form, result)) {
          form.reset(values);
          toast.success("Episode saved");
        }
      } else {
        // Redirects to the new episode on success.
        handleActionResult(form, await createEpisode(values));
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <fieldset disabled={isPending} className="grid gap-4">
        <Field id="episode-title" label="Title" error={errors.title?.message}>
          <Input placeholder="Building in public with…" {...form.register("title")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="episode-number" label="Episode number" error={errors.episodeNumber?.message}>
            <Input inputMode="numeric" placeholder="Optional" {...form.register("episodeNumber")} />
          </Field>
          <Field id="episode-status" label="Status" error={errors.status?.message}>
            {(props) => (
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" {...props}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EPISODE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {EPISODE_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </Field>
          <Field
            id="episode-recording-at"
            label="Recording date"
            description="In your time zone."
            error={errors.recordingAt?.message}
          >
            {(props) => (
              <Controller
                control={form.control}
                name="recordingAt"
                render={({ field }) => (
                  <DateTimeInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    {...props}
                  />
                )}
              />
            )}
          </Field>
          <Field id="episode-publish-at" label="Publish date" error={errors.publishAt?.message}>
            {(props) => (
              <Controller
                control={form.control}
                name="publishAt"
                render={({ field }) => (
                  <DateTimeInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    {...props}
                  />
                )}
              />
            )}
          </Field>
        </div>
        <Field id="episode-description" label="Notes" error={errors.description?.message}>
          <Textarea rows={4} placeholder="Topics, prep notes, links…" {...form.register("description")} />
        </Field>
      </fieldset>
      <Button type="submit" className="w-fit" disabled={isPending || (isEdit && !isDirty)}>
        {isPending && <Loader2 className="animate-spin" />}
        {isEdit ? "Save changes" : "Create episode"}
      </Button>
    </form>
  );
}
