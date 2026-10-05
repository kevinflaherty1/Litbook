import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteAccountForm } from "@/features/account/components/delete-account-form";
import { getAccountWorkspaces } from "@/features/account/queries";
import { ProfileForm } from "@/features/team/components/profile-form";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your account" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

export default async function AccountPage() {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const [{ data: profile }, workspaces] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    getAccountWorkspaces(user.id),
  ]);
  const blocked = workspaces.filter((w) => w.onDelete === "blocked");
  const deletedWithAccount = workspaces.filter((w) => w.onDelete === "delete");

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <Logo href="/dashboard" />
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to Litbook
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>How teammates see you.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm fullName={profile?.full_name ?? ""} email={user.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
          </CardHeader>
          <CardContent>
            {workspaces.length ? (
              <ul className="grid divide-y rounded-md border" aria-label="Your workspaces">
                {workspaces.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <Link href={`/${w.slug}`} className="font-medium hover:underline">
                      {w.name}
                    </Link>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {w.memberCount} {w.memberCount === 1 ? "member" : "members"}
                      <Badge variant="secondary">{ROLE_LABEL[w.role]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">You&apos;re not in any workspaces.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>
              Download your account details and workspace memberships as JSON. Workspace content (episodes,
              guests, files) is exported by a workspace owner or admin in its Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-fit">
              <a href="/account/export" download>
                <Download /> Download my data
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Delete account</CardTitle>
            <CardDescription>
              Permanently deletes your account and signs you out everywhere. You&apos;ll be removed from every
              workspace. This can&apos;t be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {blocked.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>You&apos;re the only owner of {blocked.map((w) => w.name).join(", ")}</AlertTitle>
                <AlertDescription>
                  Make another member an owner (Settings → Team), or delete the workspace, before deleting
                  your account.
                </AlertDescription>
              </Alert>
            )}
            {deletedWithAccount.length > 0 && (
              <Alert>
                <AlertTitle>These workspaces will be deleted too</AlertTitle>
                <AlertDescription>
                  You&apos;re their only member: {deletedWithAccount.map((w) => w.name).join(", ")}. Every
                  episode, guest, file and signed release in them is deleted, and any subscription is
                  cancelled. Export them first if you need a copy.
                </AlertDescription>
              </Alert>
            )}
            <DeleteAccountForm email={user.email ?? ""} disabled={blocked.length > 0 || !user.email} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
