"use client";

import { useState } from "react";
import {
  Ban,
  CircleAlert,
  CircleCheck,
  EllipsisVertical,
  HandCoins,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateKey,
  useDeleteKey,
  useGrantKey,
  useGroups,
  useKeys,
  usePatchKey,
  useRotateKey,
} from "@/lib/hooks";
import { budget, timeAgo, usd } from "@/lib/format";
import { PLAYGROUND_KEY_NAME } from "@/lib/playground";
import type { CreatedKey, VirtualKeyRecord } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KeyFormDialog } from "./key-form-dialog";
import { GrantDialog } from "./grant-dialog";
import { OneTimeKeyDialog } from "./one-time-key-dialog";

export function KeysPanel({ gatewayId, canAdmin }: { gatewayId: string; canAdmin: boolean }) {
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const keys = useKeys(gatewayId, includeDeleted);
  const groups = useGroups(gatewayId);
  const isAdmin = canAdmin;

  const createKey = useCreateKey(gatewayId);
  const patchKey = usePatchKey(gatewayId);
  const deleteKey = useDeleteKey(gatewayId);
  const rotateKey = useRotateKey(gatewayId);
  const grantKey = useGrantKey(gatewayId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<VirtualKeyRecord | null>(null);
  const [granting, setGranting] = useState<VirtualKeyRecord | null>(null);
  const [oneTime, setOneTime] = useState<CreatedKey | null>(null);

  const groupName = (groupId: string | null) =>
    groupId === null
      ? "—"
      : (groups.data?.find((group) => group.id === groupId)?.name ?? groupId);

  if (keys.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert className="size-4" />
        <AlertTitle>Could not load keys</AlertTitle>
        <AlertDescription>{(keys.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="include-deleted-keys"
            checked={includeDeleted}
            onCheckedChange={setIncludeDeleted}
          />
          <Label htmlFor="include-deleted-keys" className="text-sm text-muted-foreground">
            Show deleted
          </Label>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Create key
          </Button>
        )}
      </div>

      {keys.isLoading && <Skeleton className="h-64" />}

      {keys.data && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Group</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">RPM / TPM</TableHead>
                <TableHead>Created</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-muted-foreground">
                    No keys yet.
                  </TableCell>
                </TableRow>
              )}
              {keys.data.map((key) => {
                const deleted = key.deleted_at !== null;
                return (
                  <TableRow key={key.id} className={deleted ? "opacity-50" : undefined}>
                    <TableCell>
                      <p className="flex items-center gap-2 font-medium">
                        {key.name}
                        {key.name === PLAYGROUND_KEY_NAME && (
                          <Badge
                            variant="secondary"
                            title="Owned by the console: the Playground tab calls /v1 with it"
                          >
                            playground
                          </Badge>
                        )}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{key.id}</p>
                    </TableCell>
                    <TableCell>
                      {deleted ? (
                        <Badge variant="outline">deleted</Badge>
                      ) : key.disabled ? (
                        <Badge variant="secondary">disabled</Badge>
                      ) : (
                        <Badge>active</Badge>
                      )}
                    </TableCell>
                    <TableCell>{groupName(key.group_id)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(key.budget_spent)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {budget(key.budget_max)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {key.rpm_limit ?? "—"} / {key.tpm_limit ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(key.created_at)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {!deleted && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Key actions">
                                <EllipsisVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditing(key)}>
                                <Pencil className="size-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setGranting(key)}>
                                <HandCoins className="size-4" /> Grant budget
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  patchKey.mutate({
                                    keyId: key.id,
                                    body: { disabled: !key.disabled },
                                  })
                                }
                              >
                                {key.disabled ? (
                                  <>
                                    <CircleCheck className="size-4" /> Enable
                                  </>
                                ) : (
                                  <>
                                    <Ban className="size-4" /> Disable
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  rotateKey.mutate(key.id, {
                                    onSuccess: (rotated) => {
                                      setOneTime(rotated);
                                      toast.success("Key rotated — the old secret is dead");
                                    },
                                  })
                                }
                              >
                                <RefreshCw className="size-4" /> Rotate secret
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => deleteKey.mutate(key.id)}
                              >
                                <Trash2 className="size-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <KeyFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groups={groups.data ?? []}
        pending={createKey.isPending}
        onSubmit={(body) =>
          createKey.mutate(body, {
            onSuccess: (created) => {
              setCreateOpen(false);
              setOneTime(created);
            },
          })
        }
      />
      <KeyFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        groups={groups.data ?? []}
        existing={editing ?? undefined}
        pending={patchKey.isPending}
        onSubmit={(body) => {
          if (!editing) return;
          patchKey.mutate(
            { keyId: editing.id, body },
            { onSuccess: () => setEditing(null) },
          );
        }}
      />
      <GrantDialog
        open={granting !== null}
        onOpenChange={(open) => !open && setGranting(null)}
        targetName={granting?.name ?? ""}
        pending={grantKey.isPending}
        onGrant={(amount) => {
          if (!granting) return;
          grantKey.mutate(
            { keyId: granting.id, body: { amount } },
            { onSuccess: () => setGranting(null) },
          );
        }}
      />
      <OneTimeKeyDialog created={oneTime} onClose={() => setOneTime(null)} />
    </div>
  );
}
