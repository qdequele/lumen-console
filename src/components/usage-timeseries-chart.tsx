"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { UsageTimeseries } from "@/lib/types";
import { compact, usd } from "@/lib/format";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type TimeseriesMetric = "cost" | "requests" | "tokens";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
] as const;

function formatTick(unix: number, bucketSecs: number): string {
  const date = new Date(unix * 1000);
  if (bucketSecs >= 86_400) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (bucketSecs >= 6 * 3600) {
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Stacked area over time: one layer per group (top N + "other"). */
export function UsageTimeseriesChart({
  data,
  metric,
}: {
  data: UsageTimeseries;
  metric: TimeseriesMetric;
}) {
  const { rows, config } = useMemo(() => {
    const rows = data.timestamps.map((t, i) => {
      const row: Record<string, number | string> = { t };
      for (const group of data.groups) {
        row[group.name] = group[metric][i];
      }
      return row;
    });
    const config: ChartConfig = {};
    data.groups.forEach((group, index) => {
      config[group.name] = {
        label: group.name,
        color: PALETTE[index % PALETTE.length],
      };
    });
    return { rows, config };
  }, [data, metric]);

  if (data.groups.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No usage in this window.
      </p>
    );
  }

  const formatValue = (value: number) => (metric === "cost" ? usd(value) : compact(value));

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <AreaChart data={rows} margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          minTickGap={40}
          tickFormatter={(value: number) => formatTick(value, data.bucket_secs)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={56}
          tickFormatter={formatValue}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const t = payload?.[0]?.payload?.t;
                return typeof t === "number"
                  ? new Date(t * 1000).toLocaleString()
                  : String(t ?? "");
              }}
              formatter={(value, name) => (
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-mono tabular-nums">{formatValue(Number(value))}</span>
                </span>
              )}
            />
          }
        />
        {data.groups.map((group, index) => (
          <Area
            key={group.name}
            dataKey={group.name}
            stackId="usage"
            type="monotone"
            // Colors passed directly: group names are model ids and may
            // contain characters invalid in CSS custom property names.
            fill={PALETTE[index % PALETTE.length]}
            fillOpacity={0.35}
            stroke={PALETTE[index % PALETTE.length]}
            strokeWidth={1.5}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
