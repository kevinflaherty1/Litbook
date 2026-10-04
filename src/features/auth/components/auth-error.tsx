import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

const MESSAGES: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one below.",
  oauth: "We couldn't sign you in with that provider. Please try again.",
};

export function AuthError({ code }: { code?: string }) {
  if (!code) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{MESSAGES[code] ?? "Something went wrong. Please try again."}</AlertDescription>
    </Alert>
  );
}
