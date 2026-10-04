import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Button asChild>
        <Link href="/dashboard">Go to my dashboard</Link>
      </Button>
    </div>
  );
}
