import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import type { TimeseriesGroup, UsageExportPage, UsageRow, UsageTimeseries } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Time-bucketed usage, built from the raw export.
 *
 * The gateway's GET /admin/usage aggregates over one dimension with no time
 * axis; GET /admin/usage/export exists so a console can build the views the
 * aggregate cannot (ADR 010). This route paginates the export server-side,
 * filters rows, buckets them by time, and returns compact aligned series —
 * raw rows never reach the browser.
 */

const EXPORT_PAGE_LIMIT = 10_000;
/** Stop bucketing past this many rows and flag `truncated` instead. */
const MAX_ROWS = 200_000;
/** Groups beyond the most expensive TOP_GROUPS collapse into "other". */
const TOP_GROUPS = 5;

const GROUP_BY = new Set([
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
function bucketSecsFor(windowSecs: number): number {
  if (windowSecs <= 3 * 3600) return 300;
  if (windowSecs <= 2 * 86_400) return 3600;
  if (windowSecs <= 14 * 86_400) return 6 * 3600;
  return 86_400;
}

function groupValue(row: UsageRow, groupBy: string): string {
  switch (groupBy) {
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

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: false });
    if (!result) return notFound(`gateway "${id}"`);

    const search = request.nextUrl.searchParams;
    const groupBy = search.get("group_by") ?? "total";
    if (!GROUP_BY.has(groupBy)) {
      return NextResponse.json({ error: `invalid group_by "${groupBy}"` }, { status: 400 });
    }
    const filters = {
      model: search.get("model"),
      provider: search.get("provider"),
      capability: search.get("capability"),
      key_id: search.get("key_id"),
      group_id: search.get("group_id"),
    };

    const window = new URLSearchParams({ limit: String(EXPORT_PAGE_LIMIT) });
    for (const name of ["since", "until"] as const) {
      const value = search.get(name);
      if (value) window.set(name, value);
    }

    // First page resolves the window; later pages pin it so pagination
    // cannot race the moving "last 24h" default.
    let page = await lumenFetch<UsageExportPage>(
      result.conn,
      `/admin/usage/export?${window.toString()}`,
    );
    const since = page.since;
    const until = page.until;
    const bucketSecs = bucketSecsFor(Math.max(until - since, 1));
    const bucketCount = Math.max(1, Math.ceil((until - since + 1) / bucketSecs));
    const timestamps = Array.from({ length: bucketCount }, (_, i) => since + i * bucketSecs);

    // buckets per group: name → per-metric arrays aligned to `timestamps`.
    const groups = new Map<string, { cost: number[]; requests: number[]; tokens: number[] }>();
    const totals = new Map<string, number>();
    let processed = 0;
    let truncated = false;

    const ingest = (rows: UsageRow[]) => {
      for (const row of rows) {
        if (filters.model && row.model !== filters.model) continue;
        if (filters.provider && row.provider !== filters.provider) continue;
        if (filters.capability && row.capability !== filters.capability) continue;
        if (filters.key_id && row.key_id !== filters.key_id) continue;
        if (filters.group_id && row.group_id !== filters.group_id) continue;
        const bucket = Math.min(
          Math.max(Math.floor((row.created_at - since) / bucketSecs), 0),
          bucketCount - 1,
        );
        const name = groupValue(row, groupBy);
        let series = groups.get(name);
        if (!series) {
          series = {
            cost: new Array<number>(bucketCount).fill(0),
            requests: new Array<number>(bucketCount).fill(0),
            tokens: new Array<number>(bucketCount).fill(0),
          };
          groups.set(name, series);
        }
        series.cost[bucket] += row.cost;
        series.requests[bucket] += 1;
        series.tokens[bucket] += row.tokens_in + row.tokens_out;
        totals.set(name, (totals.get(name) ?? 0) + row.cost);
      }
      processed += rows.length;
    };

    ingest(page.rows);
    while (page.next_cursor !== null && processed < MAX_ROWS) {
      const query = new URLSearchParams({
        since: String(since),
        until: String(until),
        cursor: String(page.next_cursor),
        limit: String(EXPORT_PAGE_LIMIT),
      });
      page = await lumenFetch<UsageExportPage>(
        result.conn,
        `/admin/usage/export?${query.toString()}`,
      );
      ingest(page.rows);
    }
    if (page.next_cursor !== null) truncated = true;

    // Most expensive groups first; the tail folds into "other".
    const ordered = [...groups.entries()].sort(
      (a, b) => (totals.get(b[0]) ?? 0) - (totals.get(a[0]) ?? 0),
    );
    const top = ordered.slice(0, TOP_GROUPS);
    const rest = ordered.slice(TOP_GROUPS);
    const series: TimeseriesGroup[] = top.map(([name, data]) => ({ name, ...data }));
    if (rest.length > 0) {
      const other: TimeseriesGroup = {
        name: "other",
        cost: new Array<number>(bucketCount).fill(0),
        requests: new Array<number>(bucketCount).fill(0),
        tokens: new Array<number>(bucketCount).fill(0),
      };
      for (const [, data] of rest) {
        for (let i = 0; i < bucketCount; i++) {
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

    const response: UsageTimeseries = {
      since,
      until,
      bucket_secs: bucketSecs,
      timestamps,
      groups: series,
      truncated,
    };
    return NextResponse.json(response);
  } catch (error) {
    return toErrorResponse(error);
  }
}
