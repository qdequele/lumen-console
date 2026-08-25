"use client";

import { useState } from "react";
import { Mail, Trash2, UserMinus } from "lucide-react";
import {
  useInvitations,
  useInvite,
  useMe,
  useRemoveMember,
  useRevokeInvitation,
  useTeamMembers,
  useUpdateMemberRole,
  useDeleteTeam,
} from "@/lib/hooks";
import { timeAgo } from "@/lib/format";
import type { Team, TeamRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TeamCard({ team }: { team: Team }) {
  const me = useMe();
  const members = useTeamMembers(team.id);
  const invitations = useInvitations(team.id);
  const updateRole = useUpdateMemberRole(team.id);
  const removeMember = useRemoveMember(team.id);
  const invite = useInvite(team.id);
  const revokeInvitation = useRevokeInvitation(team.id);
  const deleteTeam = useDeleteTeam();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");

  const canAdmin = team.role !== "viewer";
  const isOwner = team.role === "owner";

  const roleDate = (value: string) => {
    const unix = Math.floor(new Date(value).getTime() / 1000);
    return Number.isFinite(unix) ? timeAgo(unix) : "";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">{team.name}</CardTitle>
          <Badge variant={canAdmin ? "default" : "secondary"}>{team.role}</Badge>
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={() => deleteTeam.mutate(team.id)}
            >
              <Trash2 className="size-4" /> Delete team
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.isLoading && <Skeleton className="h-24" />}
        {members.data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {canAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((member) => {
                const isSelf = member.user_id === me.data?.id;
                return (
                  <TableRow key={member.user_id}>
                    <TableCell className="font-medium">
                      {member.email}
                      {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell>
                      {canAdmin && !isSelf ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            updateRole.mutate({ userId: member.user_id, role: role as TeamRole })
                          }
                        >
                          <SelectTrigger size="sm" className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner">owner</SelectItem>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="viewer">viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{member.role}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {roleDate(member.created_at)}
                    </TableCell>
                    {canAdmin && (
                      <TableCell>
                        {!isSelf && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${member.email}`}
                            onClick={() => removeMember.mutate(member.user_id)}
                          >
                            <UserMinus className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {canAdmin && (
          <>
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="email"
                placeholder="colleague@company.com"
                className="w-64"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <Select value={inviteRole} onValueChange={(role) => setInviteRole(role as TeamRole)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="viewer">viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!inviteEmail.includes("@") || invite.isPending}
                onClick={() =>
                  invite.mutate(
                    { email: inviteEmail, role: inviteRole },
                    { onSuccess: () => setInviteEmail("") },
                  )
                }
              >
                <Mail className="size-4" /> Invite
              </Button>
            </div>
            {invitations.data && invitations.data.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pending invitations
                </p>
                {invitations.data.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <span>{invitation.email}</span>
                    <Badge variant="outline">{invitation.role}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeInvitation.mutate(invitation.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
