"use client";

import { useState } from "react";
import type { GatewayPublic, Team } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface GatewayFormValues {
  team_id: string;
  name: string;
  region: string;
  url: string;
  /** Empty on edit = keep the stored key. */
  master_key: string;
}

interface GatewayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Teams the user can register gateways in (owner/admin only). */
  teams: Team[];
  /** Present when editing. */
  existing?: GatewayPublic;
  pending: boolean;
  onSubmit: (values: GatewayFormValues) => void;
}

export function GatewayDialog({
  open,
  onOpenChange,
  teams,
  existing,
  pending,
  onSubmit,
}: GatewayDialogProps) {
  const [values, setValues] = useState<GatewayFormValues>({
    team_id: "",
    name: "",
    region: "",
    url: "",
    master_key: "",
  });

  // Re-seed the form on open transition, during render (no effect needed).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues({
        team_id: existing?.team_id ?? teams[0]?.id ?? "",
        name: existing?.name ?? "",
        region: existing?.region === "unspecified" ? "" : (existing?.region ?? ""),
        url: existing?.url ?? "",
        master_key: "",
      });
    }
  }

  const set = (patch: Partial<GatewayFormValues>) =>
    setValues((state) => ({ ...state, ...patch }));

  const valid =
    values.name.trim() !== "" &&
    /^https?:\/\//.test(values.url.trim()) &&
    (existing ? true : values.team_id !== "" && values.master_key.trim() !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit “${existing.name}”` : "Register gateway"}</DialogTitle>
          <DialogDescription>
            {existing
              ? "The master key is only replaced if you enter a new one."
              : "The master key is sent once, sealed with AES-256-GCM on the console server, and never shown again."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!existing && (
            <div className="space-y-2">
              <Label>Team</Label>
              <Select value={values.team_id} onValueChange={(team_id) => set({ team_id })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gw-name">Name</Label>
              <Input
                id="gw-name"
                placeholder="EU West"
                value={values.name}
                onChange={(event) => set({ name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gw-region">Region</Label>
              <Input
                id="gw-region"
                placeholder="cdg"
                value={values.region}
                onChange={(event) => set({ region: event.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gw-url">Admin URL</Label>
            <Input
              id="gw-url"
              placeholder="http://lumen-eu.internal:8080"
              value={values.url}
              onChange={(event) => set({ url: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Must be reachable from the console server — keep admin ports on a private network.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gw-master">Master key{existing ? " (leave empty to keep)" : ""}</Label>
            <Input
              id="gw-master"
              type="password"
              autoComplete="off"
              value={values.master_key}
              onChange={(event) => set({ master_key: event.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!valid || pending} onClick={() => onSubmit(values)}>
            {pending ? "Saving…" : existing ? "Save changes" : "Register gateway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
