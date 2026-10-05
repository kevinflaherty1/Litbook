import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Shown on Pro-only settings when the workspace's plan doesn't include them. */
export function ProNotice({ orgSlug }: { orgSlug: string }) {
  return (
    <Alert>
      <Sparkles />
      <AlertTitle>Included with Pro</AlertTitle>
      <AlertDescription>
        <span>
          <Link href={`/${orgSlug}/settings/billing`} className="font-medium underline underline-offset-4">
            Upgrade to Pro
          </Link>{" "}
          to use this. Anything you set up before is kept, but guests won&apos;t see it.
        </span>
      </AlertDescription>
    </Alert>
  );
}
