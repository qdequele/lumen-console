import { NextRequest, NextResponse } from "next/server";
import { listGatewaysForUser, masterKeysFor } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { toErrorResponse } from "@/lib/server/respond";
import {
  bucketSecsFor,
  SeriesAccumulator,
  TIMESERIES_GROUP_BY,
  type RowFilters,
} from "@/lib/server/timeseries";
import type { UsageExportPage, UsageTimeseries } from "@/lib/types";

/**
 * Combined time-bucketed usage: the raw export of every gateway the caller
 * can see, merged into one set of aligned series. Unlike the per-gateway
 * route, the console resolves the window itself and passes it explicitly to
 * every gateway, so all series share the same buckets. `group_by=gateway`
 * stacks by gateway name — the one dimension only this view can offer.
 */

const EXPORT_PAGE_LIMIT = 10_000;
/** Per gateway; a slow fleet member cannot starve the others. */
const MAX_ROWS_PER_GATEWAY = 100_000;

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams;
    const groupBy = search.get("group_by") ?? "gateway";
    if (!TIMESERIES_GROUP_BY.has(groupBy)) {
      return NextResponse.json({ error: `invalid group_by "${groupBy}"` }, { status: 400 });
    }
    const filters: RowFilters = {
      model: search.get("model"),
      provider: search.get("provider"),
      capability: search.get("capability"),
      // Key/group ids are gateway-local (ADR 010) — not meaningful here.
      key_id: null,
      group_id: null,
    };

    // One shared window for every gateway, so buckets align.
    const now = Math.floor(Date.now() / 1000);
    const until = Number(search.get("until")) || now;
    const since = Number(search.get("since")) || until - 86_400;
    const bucketSecs = bucketSecsFor(Math.max(until - since, 1));
    const accumulator = new SeriesAccumulator(since, until, bucketSecs);

    const gateways = await listGatewaysForUser();
    const keys = await masterKeysFor(gateways);
    let truncated = false;

    await Promise.all(
      gateways.map(async (gateway) => {
        const masterKey = keys.get(gateway.id);
        if (!masterKey) return;
        const conn = { id: gateway.id, url: gateway.url, masterKey };
        try {
          let processed = 0;
          let cursor: number | null = null;
          do {
            const query = new URLSearchParams({
              since: String(since),
              until: String(until),
              limit: String(EXPORT_PAGE_LIMIT),
            });
            if (cursor !== null) query.set("cursor", String(cursor));
            const page: UsageExportPage = await lumenFetch<UsageExportPage>(
              conn,
              `/admin/usage/export?${query.toString()}`,
            );
            accumulator.ingest(page.rows, groupBy, filters, gateway.name);
            processed += page.rows.length;
            cursor = page.next_cursor;
            if (cursor !== null && processed >= MAX_ROWS_PER_GATEWAY) {
              truncated = true;
              break;
            }
          } while (cursor !== null);
        } catch {
          // A down gateway must not fail the combined view; the aggregate
          // call on the same page already names unreachable gateways.
        }
      }),
    );

    const response: UsageTimeseries = {
      since,
      until,
      bucket_secs: bucketSecs,
      timestamps: accumulator.timestamps,
      groups: accumulator.build(),
      truncated,
    };
    return NextResponse.json(response);
  } catch (error) {
    return toErrorResponse(error);
  }
}
