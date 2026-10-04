import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/features/auth/components/auth-form";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>Create your Litbook account</h1>
        </CardTitle>
        <CardDescription>Stop chasing guests for bios and headshots.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm
          mode="signup"
          next={typeof next === "string" ? safeNextPath(next) : undefined}
          googleEnabled={env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED}
        />
      </CardContent>
    </Card>
  );
}
