"use client";

import { useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useCombinedUsage, useGateways } from "@/lib/hooks";
import { sinceForWindow, usd, compact } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageControls } from "@/components/usage-controls";
import { UsageCostChart } from "@/components/usage-chart";
import { UsageTable } from "@/components/usage-table";

/**
 * Combined dimensions only: key and group ids are gateway-local (a project
 * is pinned to one gateway, ADR 010), so those views live on the gateway page.
 */
const COMBINED_GROUP_BY = [
  { value: "model", label: "Model" },
  { value: "model_used", label: "Model used" },
  { value: "provider", label: "Provider" },
  { value: "capability", label: "Capability" },
  { value: "status", label: "Status" },
] as const;

export default function UsagePage() {
  const [hours, setHours] = useState(24);
  const [groupBy, setGroupBy] = useState("model");
  const since = useMemo(() => sinceForWindow(hours), [hours]);
  const usage = useCombinedUsage({ since, group_by: groupBy, limit: 1000 });
  const gateways = useGateways();

  const gatewayName = (id: string) =>
    gateways.data?.find((gateway) => gateway.id === id)?.name ?? id;

  const failed = usage.data?.gateways.filter((gateway) => gateway.error) ?? [];
  const totals = usage.data?.merged.reduce(
    (acc, row) => ({
      cost: acc.cost + row.cost,
      requests: acc.requests + row.requests,
      tokens: acc.tokens + row.tokens_total,
    }),
    { cost: 0, requests: 0, tokens: 0 },
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">
          One usage query fanned out to every gateway, merged into a single view.
        </p>
      </div>

      <UsageControls
        hours={hours}
        onHoursChange={setHours}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        groupByOptions={COMBINED_GROUP_BY}
      />

      {failed.length > 0 && (
        <Alert>
          <CircleAlert className="size-4" />
          <AlertTitle>Partial data</AlertTitle>
          <AlertDescription>
            {failed.map((gateway) => (
              <p key={gateway.gatewayId}>
                {gatewayName(gateway.gatewayId)}: {gateway.error}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {usage.isError && (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Could not load combined usage</AlertTitle>
          <AlertDescription>{(usage.error as Error).message}</AlertDescription>
        </Alert>
      )}

      {usage.isLoading && <Skeleton className="h-96" />}

      {usage.data && totals && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{usd(totals.cost)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{compact(totals.requests)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Tokens</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{compact(totals.tokens)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Combined cost by {groupBy.replace("_", " ")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <UsageCostChart rows={usage.data.merged} />
              <UsageTable rows={usage.data.merged} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per gateway</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {usage.data.gateways
                .filter((gateway) => gateway.report)
                .map((gateway) => (
                  <div key={gateway.gatewayId} className="space-y-2">
                    <h3 className="text-sm font-medium">{gatewayName(gateway.gatewayId)}</h3>
                    <UsageTable rows={gateway.report?.groups ?? []} />
                  </div>
                ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
