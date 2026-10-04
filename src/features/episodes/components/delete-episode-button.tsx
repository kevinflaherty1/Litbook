"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/shared/confirm-button";
import { Button } from "@/components/ui/button";
import { deleteEpisode } from "@/features/episodes/actions";

export function DeleteEpisodeButton({
  orgId,
  episodeId,
  title,
}: {
  orgId: string;
  episodeId: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmButton
      title={`Delete "${title}"?`}
      description="This removes the episode, its bookings, and anything guests submitted for it, including signed releases. This can't be undone."
      confirmLabel="Delete episode"
      onConfirm={() =>
        startTransition(async () => {
          const result = await deleteEpisode({ orgId, episodeId });
          if (!result.ok) toast.error(result.error);
        })
      }
    >
      <Button variant="outline" size="sm" disabled={isPending}>
        <Trash2 /> Delete
      </Button>
    </ConfirmButton>
  );
}
