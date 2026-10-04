import { LinkIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export default function PortalNotFound() {
  return (
    <Card>
      <CardContent className="grid justify-items-center gap-3 py-10 text-center">
        <LinkIcon className="size-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">This link isn&apos;t working</h1>
        <p className="max-w-sm text-muted-foreground">
          It may have expired or been replaced with a newer one. Ask your host to send you a fresh link.
        </p>
      </CardContent>
    </Card>
  );
}
