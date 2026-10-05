import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomFieldsManager } from "@/features/custom-fields/components/custom-fields-manager";
import { listCustomFields } from "@/features/custom-fields/queries";
import { BrandingForm } from "@/features/organizations/components/branding-form";
import { OrganizationSettingsForm } from "@/features/organizations/components/organization-settings-form";
import { DeleteOrganizationForm } from "@/features/organizations/components/delete-organization-form";
import { GuestRemindersToggle } from "@/features/organizations/components/guest-reminders-toggle";
import { ReleaseFormEditor } from "@/features/organizations/components/release-form-editor";
import { requireOrgMembership } from "@/features/organizations/queries";
import { ProfileForm } from "@/features/team/components/profile-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const { org, user, role, canManage } = await requireOrgMembership(orgSlug);
  const supabase = await createClient();
  const [{ data: profile }, customFields] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    listCustomFields(org.id),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description={canManage ? undefined : "Only owners and admins can change workspace settings."}
      />
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Your show or company, as guests and teammates see it.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationSettingsForm org={org} disabled={!canManage} />
        </CardContent>
      </Card>
      <Card id="guest-page">
        <CardHeader>
          <CardTitle>Guest page</CardTitle>
          <CardDescription>Make the onboarding page look like your show.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm org={org} disabled={!canManage} />
        </CardContent>
      </Card>
      <Card id="questions">
        <CardHeader>
          <CardTitle>Guest questions</CardTitle>
          <CardDescription>
            Extra questions on the onboarding page, like a pre-interview questionnaire. Answers show up in
            each guest&apos;s vault and in the episode export.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomFieldsManager orgId={org.id} fields={customFields} disabled={!canManage} />
        </CardContent>
      </Card>
      <Card id="release-form">
        <CardHeader>
          <CardTitle>Guest release form</CardTitle>
          <CardDescription>Shown on every guest onboarding page.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReleaseFormEditor
            orgId={org.id}
            text={org.release_form_text}
            version={org.release_form_version}
            disabled={!canManage}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Guest reminders</CardTitle>
          <CardDescription>Automatic follow-ups, so you don&apos;t have to chase.</CardDescription>
        </CardHeader>
        <CardContent>
          <GuestRemindersToggle orgId={org.id} enabled={org.guest_reminders_enabled} disabled={!canManage} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Applies across all your workspaces.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={profile?.full_name ?? ""} email={user.email} />
        </CardContent>
      </Card>
      {role === "owner" && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Delete workspace</CardTitle>
            <CardDescription>
              Permanently deletes {org.name}: every episode, guest, submission, headshot and signed release.
              Any subscription is cancelled immediately. This can&apos;t be undone, so export anything you
              need first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteOrganizationForm orgId={org.id} slug={org.slug} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
