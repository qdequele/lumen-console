"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { UsageAggregate } from "@/lib/types";
import { usd } from "@/lib/format";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  cost: { label: "Cost", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Cost per group, top 12, horizontal bars. */
export function UsageCostChart({ rows }: { rows: UsageAggregate[] }) {
  const data = rows.slice(0, 12).map((row) => ({ group: row.group, cost: row.cost }));
  if (data.length === 0) return null;
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickFormatter={(value: number) => usd(value)} fontSize={11} />
        <YAxis
          type="category"
          dataKey="group"
          width={140}
          tickLine={false}
          axisLine={false}
          fontSize={11}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => usd(Number(value))} />}
        />
        <Bar dataKey="cost" fill="var(--color-cost)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
