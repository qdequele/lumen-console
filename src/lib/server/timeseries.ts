import "server-only";
import type { TimeseriesGroup, UsageRow } from "@/lib/types";

/**
 * Shared time-bucketing over raw usage rows (GET /admin/usage/export). Used
 * by the per-gateway and combined timeseries routes; raw rows never reach
 * the browser.
 */

/** Groups beyond the most expensive TOP_GROUPS collapse into "other". */
export const TOP_GROUPS = 5;

export const TIMESERIES_GROUP_BY = new Set([
  "gateway",
  "model",
  "model_used",
  "provider",
  "capability",
  "key_id",
  "group_id",
  "status",
  "total",
]);

/** ~24–60 buckets whatever the window. */
export function bucketSecsFor(windowSecs: number): number {
  if (windowSecs <= 3 * 3600) return 300;
  if (windowSecs <= 2 * 86_400) return 3600;
  if (windowSecs <= 14 * 86_400) return 6 * 3600;
  return 86_400;
}

export interface RowFilters {
  model: string | null;
  provider: string | null;
  capability: string | null;
  key_id: string | null;
  group_id: string | null;
}

function groupValue(row: UsageRow, groupBy: string, gatewayName: string): string {
  switch (groupBy) {
    case "gateway":
      return gatewayName;
    case "model":
      return row.model;
    case "model_used":
      return row.model_used;
    case "provider":
      return row.provider;
    case "capability":
      return row.capability;
    case "key_id":
      return row.key_id ?? "none";
    case "group_id":
      return row.group_id ?? "none";
    case "status":
      return String(row.status);
    default:
      return "total";
  }
}

interface Series {
  cost: number[];
  requests: number[];
  tokens: number[];
}

export class SeriesAccumulator {
  private readonly bucketCount: number;
  private readonly groups = new Map<string, Series>();
  private readonly totals = new Map<string, number>();

  constructor(
    private readonly since: number,
    until: number,
    private readonly bucketSecs: number,
  ) {
    this.bucketCount = Math.max(1, Math.ceil((until - since + 1) / bucketSecs));
  }

  get timestamps(): number[] {
    return Array.from({ length: this.bucketCount }, (_, i) => this.since + i * this.bucketSecs);
  }

  ingest(rows: UsageRow[], groupBy: string, filters: RowFilters, gatewayName = ""): void {
    for (const row of rows) {
      if (filters.model && row.model !== filters.model) continue;
      if (filters.provider && row.provider !== filters.provider) continue;
      if (filters.capability && row.capability !== filters.capability) continue;
      if (filters.key_id && row.key_id !== filters.key_id) continue;
      if (filters.group_id && row.group_id !== filters.group_id) continue;
      const bucket = Math.min(
        Math.max(Math.floor((row.created_at - this.since) / this.bucketSecs), 0),
        this.bucketCount - 1,
      );
      const name = groupValue(row, groupBy, gatewayName);
      let series = this.groups.get(name);
      if (!series) {
        series = {
          cost: new Array<number>(this.bucketCount).fill(0),
          requests: new Array<number>(this.bucketCount).fill(0),
          tokens: new Array<number>(this.bucketCount).fill(0),
        };
        this.groups.set(name, series);
      }
      series.cost[bucket] += row.cost;
      series.requests[bucket] += 1;
      series.tokens[bucket] += row.tokens_in + row.tokens_out;
      this.totals.set(name, (this.totals.get(name) ?? 0) + row.cost);
    }
  }

  /** Most expensive groups first; the tail folds into "other". */
  build(): TimeseriesGroup[] {
    const ordered = [...this.groups.entries()].sort(
      (a, b) => (this.totals.get(b[0]) ?? 0) - (this.totals.get(a[0]) ?? 0),
    );
    const top = ordered.slice(0, TOP_GROUPS);
    const rest = ordered.slice(TOP_GROUPS);
    const series: TimeseriesGroup[] = top.map(([name, data]) => ({ name, ...data }));
    if (rest.length > 0) {
      const other: TimeseriesGroup = {
        name: "other",
        cost: new Array<number>(this.bucketCount).fill(0),
        requests: new Array<number>(this.bucketCount).fill(0),
        tokens: new Array<number>(this.bucketCount).fill(0),
      };
      for (const [, data] of rest) {
        for (let i = 0; i < this.bucketCount; i++) {
          other.cost[i] += data.cost[i];
          other.requests[i] += data.requests[i];
          other.tokens[i] += data.tokens[i];
        }
      }
      series.push(other);
    }
    // Round costs to keep the payload tidy (floats accumulate noise).
    for (const group of series) {
      group.cost = group.cost.map((value) => Number(value.toFixed(6)));
    }
    return series;
  }
}
