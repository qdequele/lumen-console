import { NextRequest, NextResponse } from "next/server";
import { connectGateway } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { notFound, toErrorResponse } from "@/lib/server/respond";
import {
  bucketSecsFor,
  SeriesAccumulator,
  TIMESERIES_GROUP_BY,
  type RowFilters,
} from "@/lib/server/timeseries";
import type { UsageExportPage, UsageTimeseries } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Time-bucketed usage for one gateway, built from the raw export.
 *
 * The gateway's GET /admin/usage aggregates over one dimension with no time
 * axis; GET /admin/usage/export exists so a console can build the views the
 * aggregate cannot (ADR 010). This route paginates the export server-side,
 * filters rows, buckets them by time, and returns compact aligned series.
 */

const EXPORT_PAGE_LIMIT = 10_000;
/** Stop bucketing past this many rows and flag `truncated` instead. */
const MAX_ROWS = 200_000;

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const result = await connectGateway(id, { admin: false });
    if (!result) return notFound(`gateway "${id}"`);

    const search = request.nextUrl.searchParams;
    const groupBy = search.get("group_by") ?? "total";
    if (!TIMESERIES_GROUP_BY.has(groupBy) || groupBy === "gateway") {
      return NextResponse.json({ error: `invalid group_by "${groupBy}"` }, { status: 400 });
    }
    const filters: RowFilters = {
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
    const { since, until } = page;
    const accumulator = new SeriesAccumulator(
      since,
      until,
      bucketSecsFor(Math.max(until - since, 1)),
    );

    let processed = 0;
    accumulator.ingest(page.rows, groupBy, filters);
    processed += page.rows.length;
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
      accumulator.ingest(page.rows, groupBy, filters);
      processed += page.rows.length;
    }

    const response: UsageTimeseries = {
      since,
      until,
      bucket_secs: bucketSecsFor(Math.max(until - since, 1)),
      timestamps: accumulator.timestamps,
      groups: accumulator.build(),
      truncated: page.next_cursor !== null,
    };
    return NextResponse.json(response);
  } catch (error) {
    return toErrorResponse(error);
  }
}
