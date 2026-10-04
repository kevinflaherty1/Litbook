import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/features/auth/actions";
import { AcceptInvitationButton } from "@/features/team/components/accept-invitation-button";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join workspace" };

type InvitationPreview = {
  organization_name: string;
  organization_slug: string;
  email: string;
  role: "admin" | "member";
  invited_by: string | null;
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const path = `/invite/${token}`;
  const user = await requireUser(path);
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation_preview", { p_token: token });
  const invite = data as InvitationPreview | null;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <Logo href="/dashboard" />
      <Card className="w-full max-w-md">
        {!invite ? (
          <>
            <CardHeader>
              <CardTitle>
                <h1>Invitation not found</h1>
              </CardTitle>
              <CardDescription>
                This invitation is invalid, has expired, or was already used. Ask your teammate to send a new
                one.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild variant="outline">
                <Link href="/dashboard">Go to my dashboard</Link>
              </Button>
            </CardFooter>
          </>
        ) : invite.email !== user.email?.toLowerCase() ? (
          <>
            <CardHeader>
              <CardTitle>
                <h1>Wrong account</h1>
              </CardTitle>
              <CardDescription>
                This invitation to <strong>{invite.organization_name}</strong> was sent to{" "}
                <strong>{invite.email}</strong>, but you&apos;re signed in as <strong>{user.email}</strong>.
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <form action={signOut.bind(null, path)} className="w-full">
                <Button type="submit" className="w-full">
                  Sign in as {invite.email}
                </Button>
              </form>
            </CardFooter>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>
                <h1>Join {invite.organization_name}</h1>
              </CardTitle>
              <CardDescription>
                {invite.invited_by ? `${invite.invited_by} invited you` : "You've been invited"} to join as{" "}
                {invite.role === "admin" ? "an admin" : "a member"}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInvitationButton token={token} />
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
