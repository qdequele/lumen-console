"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, CircleAlert, Plus } from "lucide-react";
import { useCreateGateway, useGateways, useTeams } from "@/lib/hooks";
import { compact, usd } from "@/lib/format";
import type { GatewaySnapshot } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScopeAvatar } from "@/components/scope-avatar";
import { cn } from "@/lib/utils";
import { GatewayDialog } from "./gateway-dialog";

function GatewayRow({ gateway }: { gateway: GatewaySnapshot }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/gateways/${gateway.id}`)}
      className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-accent/40"
    >
      <ScopeAvatar seed={gateway.id} className="size-7" />
      <span className="w-52 min-w-0 shrink-0">
        <span className="block truncate text-sm font-medium">{gateway.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {gateway.team_name} · {gateway.region}
        </span>
      </span>

      {gateway.reachable === "up" ? (
        <span className="hidden min-w-0 flex-1 items-baseline gap-5 text-sm sm:flex">
          <span className="tabular-nums">
            {gateway.usage24h ? usd(gateway.usage24h.cost) : "—"}
            <span className="ml-1 text-xs text-muted-foreground">spend</span>
          </span>
          <span className="tabular-nums">
            {gateway.usage24h ? compact(gateway.usage24h.requests) : "—"}
            <span className="ml-1 text-xs text-muted-foreground">reqs</span>
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground/80">
            {gateway.url}
          </span>
        </span>
      ) : (
        <span className="hidden min-w-0 flex-1 truncate text-xs text-destructive sm:block">
          {gateway.error}
        </span>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "size-2 rounded-full",
              gateway.reachable === "up" ? "bg-success" : "bg-destructive",
            )}
          />
          {gateway.reachable === "up" ? "Up" : "Down"}
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}

export default function GatewaysPage() {
  const gateways = useGateways();
  const teams = useTeams();
  const createGateway = useCreateGateway();
  const [registerOpen, setRegisterOpen] = useState(false);
  const adminTeams = teams.data?.filter((team) => team.role !== "viewer") ?? [];

  const up = gateways.data?.filter((gateway) => gateway.reachable === "up") ?? [];
  const totals = {
    spend: up.reduce((sum, gateway) => sum + (gateway.usage24h?.cost ?? 0), 0),
    requests: up.reduce((sum, gateway) => sum + (gateway.usage24h?.requests ?? 0), 0),
    tokens: up.reduce((sum, gateway) => sum + (gateway.usage24h?.tokens_total ?? 0), 0),
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Gateways</h1>
        {adminTeams.length > 0 && (
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus className="size-4" /> Register gateway
          </Button>
        )}
      </div>

      {gateways.isError && (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Could not load gateways</AlertTitle>
          <AlertDescription>{(gateways.error as Error).message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 divide-y rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {(
          [
            ["Spend, last 24h", usd(totals.spend)],
            ["Requests, last 24h", compact(totals.requests)],
            ["Tokens, last 24h", compact(totals.tokens)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      {gateways.isLoading && <Skeleton className="h-48 rounded-lg" />}

      {gateways.data && gateways.data.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-sm font-medium">No gateways yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {adminTeams.length > 0
              ? "Register your first gateway with its admin URL and master key."
              : "Create a team first, then register a gateway."}
          </p>
          {adminTeams.length > 0 ? (
            <Button size="sm" onClick={() => setRegisterOpen(true)}>
              <Plus className="size-4" /> Register gateway
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link href="/teams">Create a team</Link>
            </Button>
          )}
        </div>
      )}

      {gateways.data && gateways.data.length > 0 && (
        <div className="divide-y rounded-lg border">
          {gateways.data.map((gateway) => (
            <GatewayRow key={gateway.id} gateway={gateway} />
          ))}
        </div>
      )}

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
            { onSuccess: () => setRegisterOpen(false) },
          )
        }
      />
    </div>
  );
}
