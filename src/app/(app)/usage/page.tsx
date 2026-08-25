"use client";

import { useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useCombinedUsage, useCombinedUsageTimeseries, useGateways } from "@/lib/hooks";
import { sinceForWindow, usd, compact } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageControls } from "@/components/usage-controls";
import { UsageCostChart } from "@/components/usage-chart";
import { UsageTable } from "@/components/usage-table";
import {
  UsageTimeseriesChart,
  type TimeseriesMetric,
} from "@/components/usage-timeseries-chart";

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

/** Chart dimensions: everything the table offers, plus "by gateway". */
const CHART_GROUP_BY = [
  { value: "gateway", label: "gateway" },
  { value: "model", label: "model" },
  { value: "model_used", label: "model used" },
  { value: "provider", label: "provider" },
  { value: "capability", label: "capability" },
  { value: "status", label: "status" },
] as const;

export default function UsagePage() {
  const [hours, setHours] = useState(24);
  const [groupBy, setGroupBy] = useState("model");
  const [chartGroupBy, setChartGroupBy] = useState("gateway");
  const [metric, setMetric] = useState<TimeseriesMetric>("cost");
  const since = useMemo(() => sinceForWindow(hours), [hours]);
  const usage = useCombinedUsage({ since, group_by: groupBy, limit: 1000 });
  const timeseries = useCombinedUsageTimeseries({ since, group_by: chartGroupBy });
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {metric === "cost" ? "Cost" : metric === "requests" ? "Requests" : "Tokens"} over
              time
              {timeseries.data?.truncated && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (row cap reached — early part of the window only)
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={chartGroupBy} onValueChange={setChartGroupBy}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_GROUP_BY.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      By {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={metric}
                onValueChange={(value) => setMetric(value as TimeseriesMetric)}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cost">Cost</SelectItem>
                  <SelectItem value="requests">Requests</SelectItem>
                  <SelectItem value="tokens">Tokens</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {timeseries.isLoading && <Skeleton className="h-64" />}
          {timeseries.isError && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {(timeseries.error as Error).message}
            </p>
          )}
          {timeseries.data && <UsageTimeseriesChart data={timeseries.data} metric={metric} />}
        </CardContent>
      </Card>

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
