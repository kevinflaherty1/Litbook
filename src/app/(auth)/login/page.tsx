import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthError } from "@/features/auth/components/auth-error";
import { AuthForm } from "@/features/auth/components/auth-form";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error, deleted } = await searchParams;
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>Welcome back</h1>
        </CardTitle>
        <CardDescription>Sign in with a magic link. No password needed.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {deleted === "1" && (
          <Alert>
            <AlertTitle>Your account was deleted</AlertTitle>
            <AlertDescription>Thanks for using Litbook. You can sign up again any time.</AlertDescription>
          </Alert>
        )}
        <AuthError code={typeof error === "string" ? error : undefined} />
        <AuthForm
          mode="login"
          next={typeof next === "string" ? safeNextPath(next) : undefined}
          googleEnabled={env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED}
        />
      </CardContent>
    </Card>
  );
}
