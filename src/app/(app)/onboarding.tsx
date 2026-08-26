"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { useCreateGateway, useCreateTeam, useTeams } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { GatewayDialog } from "@/components/gateway-dialog";
import { cn } from "@/lib/utils";

/** First-run flow: a team, then a gateway. Gone forever once one exists. */
export function Onboarding() {
  const router = useRouter();
  const teams = useTeams();
  const createTeam = useCreateTeam();
  const createGateway = useCreateGateway();

  const [teamName, setTeamName] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);

  const adminTeams = teams.data?.filter((team) => team.role !== "viewer") ?? [];
  const hasTeam = adminTeams.length > 0;

  if (teams.isLoading) {
    return <Skeleton className="mx-auto mt-16 h-64 max-w-lg rounded-lg" />;
  }

  return (
    <div className="mx-auto mt-12 max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Lumen Console</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Two steps and you have a dashboard: gateways belong to teams, so create a team first,
          then register your gateway with its admin URL and master key.
        </p>
      </div>

      <section className={cn("rounded-lg border", hasTeam && "opacity-70")}>
        <div className="flex items-center gap-3 px-5 py-4">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
              hasTeam && "border-success text-success",
            )}
          >
            {hasTeam ? <Check className="size-3.5" /> : "1"}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium">Create a team</h2>
            {hasTeam ? (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {adminTeams[0].name} — you are its owner.
              </p>
            ) : (
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="Platform team"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                />
                <Button
                  disabled={teamName.trim() === "" || createTeam.isPending}
                  onClick={() => createTeam.mutate(teamName.trim())}
                >
                  Create
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={cn("rounded-lg border", !hasTeam && "opacity-50")}>
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
            2
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium">Register a gateway</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Its admin URL must be reachable from this console server.
            </p>
          </div>
          <Button disabled={!hasTeam} onClick={() => setRegisterOpen(true)}>
            <Plus className="size-4" /> Register
          </Button>
        </div>
      </section>

      <GatewayDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        teams={adminTeams}
        pending={createGateway.isPending}
        onSubmit={(values) =>
          createGateway.mutate(
            {
              team_id: values.team_id,
              name: values.name,
              region: values.region || undefined,
              url: values.url,
              master_key: values.master_key,
            },
            { onSuccess: (created) => router.push(`/gateways/${created.id}`) },
          )
        }
      />
    </div>
  );
}
