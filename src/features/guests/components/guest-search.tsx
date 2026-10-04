import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A plain GET form, so search works without JavaScript and is shareable by URL. */
export function GuestSearch({ action, q }: { action: string; q: string }) {
  return (
    <form action={action} role="search" className="flex flex-wrap gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name or email"
          aria-label="Search guests"
          className="pl-8"
        />
      </div>
      <Button type="submit" variant="secondary">
        Search
      </Button>
      {q && (
        <Button asChild variant="ghost">
          <Link href={action}>Clear</Link>
        </Button>
      )}
    </form>
  );
}
