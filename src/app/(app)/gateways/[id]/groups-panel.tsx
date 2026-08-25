"use client";

import { useState } from "react";
import {
  CircleAlert,
  EllipsisVertical,
  HandCoins,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useCreateGroup,
  useDeleteGroup,
  useGrantGroup,
  useGroups,
  useKeys,
  usePatchGroup,
} from "@/lib/hooks";
import { budget, timeAgo, usd } from "@/lib/format";
import type { GroupRecord } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GrantDialog } from "./grant-dialog";

interface GroupFormState {
  /** Group being edited, or null when creating. */
  existing: GroupRecord | null;
  name: string;
  budgetMax: string;
}

export function GroupsPanel({ gatewayId, canAdmin }: { gatewayId: string; canAdmin: boolean }) {
  const groups = useGroups(gatewayId);
  const keys = useKeys(gatewayId);
  const isAdmin = canAdmin;

  const createGroup = useCreateGroup(gatewayId);
  const patchGroup = usePatchGroup(gatewayId);
  const deleteGroup = useDeleteGroup(gatewayId);
  const grantGroup = useGrantGroup(gatewayId);

  const [form, setForm] = useState<GroupFormState | null>(null);
  const [granting, setGranting] = useState<GroupRecord | null>(null);

  const memberCount = (groupId: string) =>
    keys.data?.filter((key) => key.group_id === groupId).length ?? 0;

  const submit = () => {
    if (!form) return;
    const budgetMax = form.budgetMax.trim() === "" ? null : Number(form.budgetMax);
    if (budgetMax !== null && (!Number.isFinite(budgetMax) || budgetMax <= 0)) return;
    const body = { name: form.name.trim(), budget_max: budgetMax };
    if (form.existing) {
      patchGroup.mutate(
        { groupId: form.existing.id, body },
        { onSuccess: () => setForm(null) },
      );
    } else {
      createGroup.mutate(body, { onSuccess: () => setForm(null) });
    }
  };

  if (groups.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert className="size-4" />
        <AlertTitle>Could not load groups</AlertTitle>
        <AlertDescription>{(groups.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Shared budget pools — member keys draw from the pool in addition to their own budget.
        </p>
        {isAdmin && (
          <Button onClick={() => setForm({ existing: null, name: "", budgetMax: "" })}>
            <Plus className="size-4" /> Create group
          </Button>
        )}
      </div>

      {groups.isLoading && <Skeleton className="h-48" />}

      {groups.data && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Pool spent</TableHead>
                <TableHead className="text-right">Pool budget</TableHead>
                <TableHead>Created</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.data.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 6 : 5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No budget groups yet.
                  </TableCell>
                </TableRow>
              )}
              {groups.data.map((group) => (
                <TableRow key={group.id}>
                  <TableCell>
                    <p className="font-medium">{group.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{group.id}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge variant="secondary">{memberCount(group.id)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {usd(group.budget_spent)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {budget(group.budget_max)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {timeAgo(group.created_at)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Group actions">
                            <EllipsisVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              setForm({
                                existing: group,
                                name: group.name,
                                budgetMax: group.budget_max?.toString() ?? "",
                              })
                            }
                          >
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setGranting(group)}>
                            <HandCoins className="size-4" /> Grant budget
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => deleteGroup.mutate(group.id)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{form?.existing ? `Edit “${form.existing.name}”` : "Create group"}</DialogTitle>
            <DialogDescription>
              A new cap binds every member key on its next request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                value={form?.name ?? ""}
                onChange={(event) =>
                  setForm((state) => state && { ...state, name: event.target.value })
                }
                placeholder="acme-corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-budget">Shared budget (USD)</Label>
              <Input
                id="group-budget"
                inputMode="decimal"
                value={form?.budgetMax ?? ""}
                onChange={(event) =>
                  setForm((state) => state && { ...state, budgetMax: event.target.value })
                }
                placeholder="unlimited (pure attribution)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={submit}
              disabled={
                !form ||
                form.name.trim() === "" ||
                createGroup.isPending ||
                patchGroup.isPending
              }
            >
              {form?.existing ? "Save changes" : "Create group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <GrantDialog
        open={granting !== null}
        onOpenChange={(open) => !open && setGranting(null)}
        targetName={granting?.name ?? ""}
        pending={grantGroup.isPending}
        onGrant={(amount) => {
          if (!granting) return;
          grantGroup.mutate(
            { groupId: granting.id, body: { amount } },
            { onSuccess: () => setGranting(null) },
          );
        }}
      />
    </div>
  );
}
