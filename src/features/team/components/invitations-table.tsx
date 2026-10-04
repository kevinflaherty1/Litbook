"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { revokeInvitation } from "@/features/team/actions";

type Invitation = { id: string; email: string; role: string; expires_at: string; expired: boolean };

export function InvitationsTable({ orgId, invitations }: { orgId: string; invitations: Invitation[] }) {
  const [isPending, startTransition] = useTransition();

  if (!invitations.length) {
    return <p className="text-sm text-muted-foreground">No pending invitations.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead className="w-28">Role</TableHead>
          <TableHead className="w-40">Expires</TableHead>
          <TableHead className="w-28 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invite) => (
          <TableRow key={invite.id}>
            <TableCell className="font-medium">{invite.email}</TableCell>
            <TableCell className="capitalize">{invite.role}</TableCell>
            <TableCell>
              {invite.expired ? (
                <Badge variant="outline">Expired</Badge>
              ) : (
                new Date(invite.expires_at).toLocaleDateString(undefined, { dateStyle: "medium" })
              )}
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await revokeInvitation({ orgId, invitationId: invite.id });
                    if (result.ok) toast.success(`Invitation for ${invite.email} revoked`);
                    else toast.error(result.error);
                  })
                }
              >
                Revoke
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
