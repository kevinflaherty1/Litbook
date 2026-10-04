import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgMembership } from "@/features/organizations/queries";
import { InvitationsTable } from "@/features/team/components/invitations-table";
import { InviteMemberForm } from "@/features/team/components/invite-member-form";
import { MembersTable } from "@/features/team/components/members-table";
import { getMembers, getPendingInvitations } from "@/features/team/queries";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/[orgSlug]/settings/team">) {
  const { orgSlug } = await params;
  const { org, user, role, canManage } = await requireOrgMembership(orgSlug);
  const [members, invitations] = await Promise.all([
    getMembers(org.id),
    canManage ? getPendingInvitations(org.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Team" description={`People who can manage episodes and guests in ${org.name}.`} />

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>
              Admins can manage the team and settings. Members can manage episodes and guests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteMemberForm orgId={org.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "person" : "people"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MembersTable orgId={org.id} members={members} currentUserId={user.id} currentRole={role} />
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <InvitationsTable orgId={org.id} invitations={invitations} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
