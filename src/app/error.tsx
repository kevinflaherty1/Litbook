"use client";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">An unexpected error occurred. Please try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
