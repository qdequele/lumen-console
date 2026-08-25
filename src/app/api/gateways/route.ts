import { NextRequest, NextResponse } from "next/server";
import { listGatewaysForUser, masterKeysFor, storeMasterKey } from "@/lib/server/gateways";
import { lumenFetch, lumenFetchPublic } from "@/lib/server/lumen";
import { toErrorResponse } from "@/lib/server/respond";
import { requireUser } from "@/lib/server/role";
import { supabaseServer } from "@/lib/server/supabase";
import type {
  GatewayPublic,
  GatewaySnapshot,
  NewGatewayBody,
  ProviderHealthMap,
  UsageReport,
} from "@/lib/types";

/**
 * Snapshot: every gateway across the caller's teams with
 * reachability, provider health and last-24h usage, gathered concurrently.
 * A gateway being down must never fail the whole list, so failures
 * degrade per-gateway.
 */
async function snapshot(
  gateway: GatewayPublic,
  masterKey: string | undefined,
): Promise<GatewaySnapshot> {
  try {
    await lumenFetchPublic<unknown>(gateway.url, "/health");
  } catch (error) {
    return {
      ...gateway,
      reachable: "down",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const [providers, usage] = await Promise.allSettled([
    lumenFetchPublic<ProviderHealthMap>(gateway.url, "/health/providers"),
    masterKey
      ? lumenFetch<UsageReport>(
          { id: gateway.id, url: gateway.url, masterKey },
          "/admin/usage?group_by=total",
        )
      : Promise.reject(new Error("no master key stored")),
  ]);
  return {
    ...gateway,
    reachable: "up",
    providers: providers.status === "fulfilled" ? providers.value : undefined,
    usage24h: usage.status === "fulfilled" ? (usage.value.groups[0] ?? null) : undefined,
  };
}

export async function GET() {
  try {
    const gateways = await listGatewaysForUser();
    const keys = await masterKeysFor(gateways);
    const snapshots = await Promise.all(
      gateways.map((gateway) => snapshot(gateway, keys.get(gateway.id))),
    );
    return NextResponse.json(snapshots);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = (await request.json()) as NewGatewayBody;
    if (!body.team_id || !body.name?.trim() || !body.url?.trim() || !body.master_key?.trim()) {
      return NextResponse.json(
        { error: "team_id, name, url and master_key are required" },
        { status: 400 },
      );
    }
    if (!/^https?:\/\//.test(body.url)) {
      return NextResponse.json({ error: "url must be http(s)" }, { status: 400 });
    }
    // RLS enforces the admin/owner requirement on the insert itself.
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("gateways")
      .insert({
        team_id: body.team_id,
        name: body.name.trim(),
        region: body.region?.trim() || "unspecified",
        url: body.url.trim().replace(/\/+$/, ""),
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await storeMasterKey(data.id, body.master_key.trim());
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
