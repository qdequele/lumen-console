import "server-only";
import type { GatewayPublic, TeamRole } from "@/lib/types";
import { openSecret, sealSecret } from "@/lib/server/crypto";
import { ForbiddenError, requireUser } from "@/lib/server/role";
import { supabaseServer, supabaseService } from "@/lib/server/supabase";

/** What the Lumen client needs to call one gateway. */
export interface GatewayConnection {
  id: string;
  url: string;
  masterKey: string;
}

interface GatewayRow {
  id: string;
  team_id: string;
  name: string;
  region: string;
  url: string;
  teams: { name: string } | null;
}

const GATEWAY_COLUMNS = "id, team_id, name, region, url, teams(name)";

function toPublic(row: GatewayRow, role: TeamRole): GatewayPublic {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    url: row.url.replace(/\/+$/, ""),
    team_id: row.team_id,
    team_name: row.teams?.name ?? "",
    role,
  };
}

async function rolesByTeam(userId: string): Promise<Map<string, TeamRole>> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.team_id as string, row.role as TeamRole]));
}

/** Every gateway across the caller's teams (RLS scopes the select). */
export async function listGatewaysForUser(): Promise<GatewayPublic[]> {
  const user = await requireUser();
  const supabase = await supabaseServer();
  const [{ data, error }, roles] = await Promise.all([
    supabase.from("gateways").select(GATEWAY_COLUMNS).order("created_at"),
    rolesByTeam(user.id),
  ]);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as GatewayRow[]).map((row) =>
    toPublic(row, roles.get(row.team_id) ?? "viewer"),
  );
}

/** One gateway, if the caller is a member of its team; null otherwise. */
export async function findGateway(id: string): Promise<GatewayPublic | null> {
  const user = await requireUser();
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("gateways")
    .select(GATEWAY_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const roles = await rolesByTeam(user.id);
  const row = data as unknown as GatewayRow;
  return toPublic(row, roles.get(row.team_id) ?? "viewer");
}

/**
 * Resolve a gateway into something callable: membership verified through
 * RLS first, then (and only then) the sealed master key is read with the
 * service role and opened. `admin: true` additionally requires owner/admin.
 */
export async function connectGateway(
  id: string,
  options: { admin: boolean },
): Promise<{ gateway: GatewayPublic; conn: GatewayConnection } | null> {
  const gateway = await findGateway(id);
  if (!gateway) return null;
  if (options.admin && gateway.role === "viewer") {
    throw new ForbiddenError();
  }
  const { data, error } = await supabaseService()
    .from("gateway_secrets")
    .select("master_key_ciphertext")
    .eq("gateway_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`gateway "${gateway.name}" has no stored master key`);
  return {
    gateway,
    conn: { id: gateway.id, url: gateway.url, masterKey: openSecret(data.master_key_ciphertext) },
  };
}

/**
 * Bulk master-key resolution for cross-gateway fan-outs: one service-role read for
 * every secret, called only with a gateway list that RLS already scoped to
 * the caller's teams. Gateways with no stored secret are simply absent.
 */
export async function masterKeysFor(
  gateways: Pick<GatewayPublic, "id">[],
): Promise<Map<string, string>> {
  if (gateways.length === 0) return new Map();
  const { data, error } = await supabaseService()
    .from("gateway_secrets")
    .select("gateway_id, master_key_ciphertext")
    .in(
      "gateway_id",
      gateways.map((gateway) => gateway.id),
    );
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((row) => [row.gateway_id as string, openSecret(row.master_key_ciphertext)]),
  );
}

/** Seal and store (or replace) a gateway's master key. */
export async function storeMasterKey(gatewayId: string, masterKey: string): Promise<void> {
  const { error } = await supabaseService()
    .from("gateway_secrets")
    .upsert({
      gateway_id: gatewayId,
      master_key_ciphertext: sealSecret(masterKey),
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}
