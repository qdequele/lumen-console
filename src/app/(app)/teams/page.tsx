"use client";

import { useState } from "react";
import { CircleAlert, Plus } from "lucide-react";
import { useCreateTeam, useTeams } from "@/lib/hooks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { TeamCard } from "./team-card";

export default function TeamsPage() {
  const teams = useTeams();
  const createTeam = useCreateTeam();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground">
            Gateways belong to teams. Owners and admins manage gateways and keys; viewers get
            read-only dashboards.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New team
        </Button>
      </div>

      {teams.isError && (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Could not load teams</AlertTitle>
          <AlertDescription>{(teams.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {teams.isLoading && <Skeleton className="h-48" />}

      {teams.data?.length === 0 && (
        <Alert>
          <CircleAlert className="size-4" />
          <AlertTitle>No team yet</AlertTitle>
          <AlertDescription>
            Create one to start registering gateways — you become its owner.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {teams.data?.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setName("");
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
            <DialogDescription>You become the team&apos;s owner.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              placeholder="Platform team"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={name.trim() === "" || createTeam.isPending}
              onClick={() =>
                createTeam.mutate(name.trim(), {
                  onSuccess: () => {
                    setCreateOpen(false);
                    setName("");
                  },
                })
              }
            >
              Create team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
