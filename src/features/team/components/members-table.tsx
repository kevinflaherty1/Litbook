"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { ConfirmButton } from "@/components/shared/confirm-button";
import { initials } from "@/components/shared/user-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { changeMemberRole, removeMember } from "@/features/team/actions";
import type { OrgRole } from "@/schemas/team";

type Member = {
  user_id: string;
  role: OrgRole;
  full_name: string | null;
  email: string | null;
};

const ROLE_LABEL: Record<OrgRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export function MembersTable({
  orgId,
  members,
  currentUserId,
  currentRole,
}: {
  orgId: string;
  members: Member[];
  currentUserId: string;
  currentRole: OrgRole;
}) {
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead className="w-40">Role</TableHead>
          <TableHead className="w-32 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const label = m.full_name || m.email || "Unknown";
          const canRemove =
            isSelf || currentRole === "owner" || (currentRole === "admin" && m.role !== "owner");

          return (
            <TableRow key={m.user_id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="text-xs">{initials(label)}</AvatarFallback>
                  </Avatar>
                  <div className="grid">
                    <span className="font-medium">
                      {label} {isSelf && <span className="text-muted-foreground">(you)</span>}
                    </span>
                    {m.full_name && <span className="text-xs text-muted-foreground">{m.email}</span>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {currentRole === "owner" ? (
                  <Select
                    value={m.role}
                    disabled={isPending}
                    onValueChange={(role) =>
                      run(
                        () => changeMemberRole({ orgId, userId: m.user_id, role: role as OrgRole }),
                        `${label} is now ${ROLE_LABEL[role as OrgRole].toLowerCase()}`,
                      )
                    }
                  >
                    <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="member">Member</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                {canRemove && (
                  <ConfirmButton
                    title={isSelf ? "Leave this workspace?" : `Remove ${label}?`}
                    description={
                      isSelf
                        ? "You'll lose access to its episodes and guests until someone invites you again."
                        : "They'll lose access to this workspace immediately."
                    }
                    confirmLabel={isSelf ? "Leave" : "Remove"}
                    onConfirm={() =>
                      run(
                        () => removeMember({ orgId, userId: m.user_id }),
                        isSelf ? "You left the workspace" : `${label} was removed`,
                      )
                    }
                  >
                    <Button variant="ghost" size="sm" disabled={isPending}>
                      {isSelf ? "Leave" : "Remove"}
                    </Button>
                  </ConfirmButton>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
