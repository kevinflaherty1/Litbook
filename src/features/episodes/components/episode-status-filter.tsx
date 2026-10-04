import Link from "next/link";

import { cn } from "@/lib/utils";
import { EPISODE_STATUS_LABEL, EPISODE_STATUSES, type EpisodeStatus } from "@/schemas/episode";

/** Status tabs as plain links, so filtering works without JavaScript. */
export function EpisodeStatusFilter({ basePath, current }: { basePath: string; current?: EpisodeStatus }) {
  const options: { label: string; href: string; active: boolean }[] = [
    { label: "All", href: basePath, active: !current },
    ...EPISODE_STATUSES.map((s) => ({
      label: EPISODE_STATUS_LABEL[s],
      href: `${basePath}?status=${s}`,
      active: current === s,
    })),
  ];

  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          aria-current={o.active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground",
            o.active && "bg-background text-foreground shadow-xs",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
