"use client";

import { useMemo, useState } from "react";
import { CircleAlert, Download } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  useGatewayConfig,
  useGroups,
  useKeys,
  useUsage,
  useUsageTimeseries,
} from "@/lib/hooks";
import { sinceForWindow } from "@/lib/format";
import type { UsageRow } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

const ALL = "__all__";

/** RFC 4180-ish CSV: quote everything, double embedded quotes. */
function toCsv(rows: UsageRow[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]) as (keyof UsageRow)[];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escape(row[column])).join(","));
  }
  return lines.join("\n");
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}

function FilterSelect({ value, onChange, placeholder, options }: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UsagePanel({ gatewayId }: { gatewayId: string }) {
  const [hours, setHours] = useState(24);
  const [groupBy, setGroupBy] = useState("model");
  const [model, setModel] = useState(ALL);
  const [provider, setProvider] = useState(ALL);
  const [capability, setCapability] = useState(ALL);
  const [keyId, setKeyId] = useState(ALL);
  const [groupId, setGroupId] = useState(ALL);
  const [metric, setMetric] = useState<TimeseriesMetric>("cost");
  const [exporting, setExporting] = useState(false);

  // Freeze `since` per (hours) selection so the query key stays stable
  // across re-renders instead of producing a new timestamp each render.
  const since = useMemo(() => sinceForWindow(hours), [hours]);

  const config = useGatewayConfig(gatewayId);
  const keys = useKeys(gatewayId);
  const groups = useGroups(gatewayId);

  const filterQuery = {
    model: model === ALL ? undefined : model,
    provider: provider === ALL ? undefined : provider,
    capability: capability === ALL ? undefined : capability,
    key_id: keyId === ALL ? undefined : keyId,
    group_id: groupId === ALL ? undefined : groupId,
  };
  const usage = useUsage(gatewayId, {
    since,
    group_by: groupBy,
    limit: 1000,
    ...filterQuery,
  });
  const timeseries = useUsageTimeseries(gatewayId, {
    since,
    group_by: groupBy,
    ...filterQuery,
  });

  const providerOptions = (config.data?.providers ?? []).map((entry) => ({
    value: entry.name,
    label: entry.name,
  }));
  const modelOptions = (config.data?.providers ?? []).flatMap((entry) =>
    entry.models.map((m) => ({ value: m.id, label: m.id })),
  );
  const keyOptions = (keys.data ?? []).map((key) => ({ value: key.id, label: key.name }));
  const groupOptions = (groups.data ?? []).map((group) => ({
    value: group.id,
    label: group.name,
  }));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: UsageRow[] = [];
      // First page resolves the window; later pages pin it (see the export
      // route) so pagination cannot race a moving default window.
      let page = await api.usageExport(gatewayId, { since, limit: 5000 });
      rows.push(...page.rows);
      while (page.next_cursor !== null) {
        page = await api.usageExport(gatewayId, {
          since: String(page.since),
          until: String(page.until),
          cursor: page.next_cursor,
          limit: 5000,
        });
        rows.push(...page.rows);
      }
      if (rows.length === 0) {
        toast.info("No usage rows in this window");
        return;
      }
      const blob = new Blob([toCsv(rows)], { type: "text/csv" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `usage-${gatewayId}-${page.since}-${page.until}.csv`;
      anchor.click();
      URL.revokeObjectURL(href);
      toast.success(`Exported ${rows.length.toLocaleString()} usage rows`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <UsageControls
          hours={hours}
          onHoursChange={setHours}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
        />
        <FilterSelect
          value={provider}
          onChange={setProvider}
          placeholder="All providers"
          options={providerOptions}
        />
        <FilterSelect
          value={model}
          onChange={setModel}
          placeholder="All models"
          options={modelOptions}
        />
        <FilterSelect
          value={capability}
          onChange={setCapability}
          placeholder="All capabilities"
          options={[
            { value: "chat", label: "chat" },
            { value: "embed", label: "embed" },
            { value: "rerank", label: "rerank" },
            { value: "systemone", label: "systemone" },
          ]}
        />
        <FilterSelect
          value={keyId}
          onChange={setKeyId}
          placeholder="All keys"
          options={keyOptions}
        />
        <FilterSelect
          value={groupId}
          onChange={setGroupId}
          placeholder="All groups"
          options={groupOptions}
        />
        <Button
          variant="outline"
          className="ml-auto"
          disabled={exporting}
          onClick={exportCsv}
        >
          <Download className="size-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {metric === "cost" ? "Cost" : metric === "requests" ? "Requests" : "Tokens"} over
              time, by {groupBy.replace("_", " ")}
              {timeseries.data?.truncated && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (row cap reached — early part of the window only)
                </span>
              )}
            </CardTitle>
            <Select value={metric} onValueChange={(value) => setMetric(value as TimeseriesMetric)}>
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

      {usage.isError && (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Could not load usage</AlertTitle>
          <AlertDescription>{(usage.error as Error).message}</AlertDescription>
        </Alert>
      )}
      {usage.isLoading && <Skeleton className="h-80" />}
      {usage.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Cost by {groupBy.replace("_", " ")}
              {usage.data.truncated && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (truncated to the most expensive groups)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <UsageCostChart rows={usage.data.groups} />
            <UsageTable rows={usage.data.groups} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
