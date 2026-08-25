import { NextRequest, NextResponse } from "next/server";
import { listGatewaysForUser, masterKeysFor } from "@/lib/server/gateways";
import { lumenFetch } from "@/lib/server/lumen";
import { toErrorResponse } from "@/lib/server/respond";
import type { UsageAggregate, UsageReport } from "@/lib/types";

/** One gateway's contribution to the combined report. */
export interface GatewayUsageEntry {
  gatewayId: string;
  report?: UsageReport;
  error?: string;
}

export interface CombinedUsageResponse {
  gateways: GatewayUsageEntry[];
  /** Aggregates merged across gateways, keyed by the group value, cost-descending. */
  merged: UsageAggregate[];
}

const PASSTHROUGH = new Set(["model", "provider", "capability", "since", "until", "group_by", "limit"]);

function mergeInto(target: Map<string, UsageAggregate>, aggregate: UsageAggregate) {
  const existing = target.get(aggregate.group);
  if (!existing) {
    target.set(aggregate.group, { ...aggregate });
    return;
  }
  existing.requests += aggregate.requests;
  existing.requests_ok += aggregate.requests_ok;
  existing.requests_client_error += aggregate.requests_client_error;
  existing.requests_server_error += aggregate.requests_server_error;
  existing.tokens_in += aggregate.tokens_in;
  existing.tokens_out += aggregate.tokens_out;
  existing.tokens_total += aggregate.tokens_total;
  existing.estimated_requests += aggregate.estimated_requests;
  existing.upstream_requests += aggregate.upstream_requests;
  existing.search_units += aggregate.search_units;
  existing.cost += aggregate.cost;
}

/**
 * Combined usage: the same GET /admin/usage query fanned out to every
 * gateway the caller can see, plus a merged view. Key/group dimensions are
 * deliberately NOT merged across gateways (a project is pinned to one
 * gateway per ADR 010, so ids only mean something on their home gateway) —
 * the client asks a single gateway for those.
 */
export async function GET(request: NextRequest) {
  try {
    const gateways = await listGatewaysForUser();
    const keys = await masterKeysFor(gateways);
    const query = new URLSearchParams();
    for (const [name, value] of request.nextUrl.searchParams) {
      if (PASSTHROUGH.has(name)) query.set(name, value);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    const results = await Promise.all(
      gateways.map(async (gateway): Promise<GatewayUsageEntry> => {
        const masterKey = keys.get(gateway.id);
        if (!masterKey) {
          return { gatewayId: gateway.id, error: "no master key stored" };
        }
        try {
          const report = await lumenFetch<UsageReport>(
            { id: gateway.id, url: gateway.url, masterKey },
            `/admin/usage${suffix}`,
          );
          return { gatewayId: gateway.id, report };
        } catch (error) {
          return {
            gatewayId: gateway.id,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    const merged = new Map<string, UsageAggregate>();
    for (const result of results) {
      for (const aggregate of result.report?.groups ?? []) {
        mergeInto(merged, aggregate);
      }
    }
    const response: CombinedUsageResponse = {
      gateways: results,
      merged: [...merged.values()].sort((a, b) => b.cost - a.cost),
    };
    return NextResponse.json(response);
  } catch (error) {
    return toErrorResponse(error);
  }
}
