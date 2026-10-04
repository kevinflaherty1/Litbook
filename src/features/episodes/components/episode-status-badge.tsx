import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EPISODE_STATUS_LABEL, type EpisodeStatus } from "@/schemas/episode";

const STYLES: Record<EpisodeStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  recorded: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  archived: "bg-muted text-muted-foreground line-through",
};

export function EpisodeStatusBadge({ status }: { status: EpisodeStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-transparent", STYLES[status])}>
      {EPISODE_STATUS_LABEL[status]}
    </Badge>
  );
}
