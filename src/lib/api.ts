import type {
  CreatedKey,
  CurrentUser,
  GatewayConfigInfo,
  GatewaySnapshot,
  GatewayUpdateBody,
  GrantBody,
  GroupPatchBody,
  GroupRecord,
  InvitationInfo,
  KeyPatchBody,
  ModelBody,
  ModelConfig,
  NewGatewayBody,
  NewGroupBody,
  NewKeyBody,
  NewProviderBody,
  ProviderConfig,
  ProviderHealthMap,
  ProviderPatchBody,
  Team,
  TeamMemberInfo,
  TeamRole,
  UsageExportPage,
  UsageReport,
  UsageTimeseries,
  VirtualKeyRecord,
} from "@/lib/types";
import type { CombinedUsageResponse } from "@/app/api/usage/route";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = body as { error?: string; code?: string } | null;
    throw new ApiError(
      envelope?.error ?? `request failed with ${response.status}`,
      response.status,
      envelope?.code,
    );
  }
  return body as T;
}

export interface UsageQuery {
  key_id?: string;
  group_id?: string;
  model?: string;
  provider?: string;
  capability?: string;
  since?: string;
  until?: string;
  group_by?: string;
  limit?: number;
}

export function usageQueryString(query: UsageQuery): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(name, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const api = {
  me: () => request<CurrentUser>("/api/me"),

  teams: () => request<Team[]>("/api/teams"),
  createTeam: (name: string) =>
    request<Team>("/api/teams", { method: "POST", body: JSON.stringify({ name }) }),
  renameTeam: (teamId: string, name: string) =>
    request<void>(`/api/teams/${teamId}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  deleteTeam: (teamId: string) => request<void>(`/api/teams/${teamId}`, { method: "DELETE" }),

  members: (teamId: string) => request<TeamMemberInfo[]>(`/api/teams/${teamId}/members`),
  updateMemberRole: (teamId: string, userId: string, role: TeamRole) =>
    request<void>(`/api/teams/${teamId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  removeMember: (teamId: string, userId: string) =>
    request<{ left: boolean }>(`/api/teams/${teamId}/members/${userId}`, { method: "DELETE" }),

  invitations: (teamId: string) => request<InvitationInfo[]>(`/api/teams/${teamId}/invitations`),
  invite: (teamId: string, email: string, role: TeamRole) =>
    request<InvitationInfo>(`/api/teams/${teamId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  revokeInvitation: (teamId: string, inviteId: string) =>
    request<void>(`/api/teams/${teamId}/invitations/${inviteId}`, { method: "DELETE" }),

  gateways: () => request<GatewaySnapshot[]>("/api/gateways"),
  createGateway: (body: NewGatewayBody) =>
    request<{ id: string }>("/api/gateways", { method: "POST", body: JSON.stringify(body) }),
  updateGateway: (gatewayId: string, body: GatewayUpdateBody) =>
    request<void>(`/api/gateways/${gatewayId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteGateway: (gatewayId: string) =>
    request<void>(`/api/gateways/${gatewayId}`, { method: "DELETE" }),
  providers: (gatewayId: string) =>
    request<ProviderHealthMap>(`/api/gateways/${gatewayId}/providers`),
  usage: (gatewayId: string, query: UsageQuery) =>
    request<UsageReport>(`/api/gateways/${gatewayId}/usage${usageQueryString(query)}`),
  usageTimeseries: (gatewayId: string, query: UsageQuery) =>
    request<UsageTimeseries>(
      `/api/gateways/${gatewayId}/usage/timeseries${usageQueryString(query)}`,
    ),
  usageExport: (
    gatewayId: string,
    query: { since?: string; until?: string; cursor?: number; limit?: number },
  ) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) params.set(name, String(value));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<UsageExportPage>(`/api/gateways/${gatewayId}/usage/export${suffix}`);
  },
  combinedUsage: (query: UsageQuery) =>
    request<CombinedUsageResponse>(`/api/usage${usageQueryString(query)}`),

  keys: (gatewayId: string, includeDeleted = false) =>
    request<VirtualKeyRecord[]>(
      `/api/gateways/${gatewayId}/keys${includeDeleted ? "?include_deleted=true" : ""}`,
    ),
  createKey: (gatewayId: string, body: NewKeyBody) =>
    request<CreatedKey>(`/api/gateways/${gatewayId}/keys`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchKey: (gatewayId: string, keyId: string, body: KeyPatchBody) =>
    request<VirtualKeyRecord>(`/api/gateways/${gatewayId}/keys/${keyId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteKey: (gatewayId: string, keyId: string) =>
    request<void>(`/api/gateways/${gatewayId}/keys/${keyId}`, { method: "DELETE" }),
  rotateKey: (gatewayId: string, keyId: string) =>
    request<CreatedKey>(`/api/gateways/${gatewayId}/keys/${keyId}/rotate`, {
      method: "POST",
    }),
  grantKey: (gatewayId: string, keyId: string, body: GrantBody) =>
    request<VirtualKeyRecord>(`/api/gateways/${gatewayId}/keys/${keyId}/grant`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  groups: (gatewayId: string, includeDeleted = false) =>
    request<GroupRecord[]>(
      `/api/gateways/${gatewayId}/groups${includeDeleted ? "?include_deleted=true" : ""}`,
    ),
  createGroup: (gatewayId: string, body: NewGroupBody) =>
    request<GroupRecord>(`/api/gateways/${gatewayId}/groups`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchGroup: (gatewayId: string, groupId: string, body: GroupPatchBody) =>
    request<GroupRecord>(`/api/gateways/${gatewayId}/groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteGroup: (gatewayId: string, groupId: string) =>
    request<void>(`/api/gateways/${gatewayId}/groups/${groupId}`, { method: "DELETE" }),
  grantGroup: (gatewayId: string, groupId: string, body: GrantBody) =>
    request<GroupRecord>(`/api/gateways/${gatewayId}/groups/${groupId}/grant`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  gatewayConfig: (gatewayId: string) =>
    request<GatewayConfigInfo>(`/api/gateways/${gatewayId}/config`),
  addProvider: (gatewayId: string, body: NewProviderBody) =>
    request<ProviderConfig>(`/api/gateways/${gatewayId}/config/providers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateProvider: (gatewayId: string, name: string, body: ProviderPatchBody) =>
    request<ProviderConfig>(
      `/api/gateways/${gatewayId}/config/providers/${encodeURIComponent(name)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteProvider: (gatewayId: string, name: string) =>
    request<void>(`/api/gateways/${gatewayId}/config/providers/${encodeURIComponent(name)}`, {
      method: "DELETE",
    }),
  addModel: (gatewayId: string, provider: string, body: ModelBody) =>
    request<ModelConfig>(
      `/api/gateways/${gatewayId}/config/providers/${encodeURIComponent(provider)}/models`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateModel: (gatewayId: string, provider: string, modelId: string, body: Partial<ModelBody>) =>
    request<ModelConfig>(
      `/api/gateways/${gatewayId}/config/providers/${encodeURIComponent(provider)}/models/${encodeURIComponent(modelId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deleteModel: (gatewayId: string, provider: string, modelId: string) =>
    request<void>(
      `/api/gateways/${gatewayId}/config/providers/${encodeURIComponent(provider)}/models/${encodeURIComponent(modelId)}`,
      { method: "DELETE" },
    ),

  putProviderKey: (gatewayId: string, name: string, key: string) =>
    request<void>(`/api/gateways/${gatewayId}/provider-keys/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify({ key }),
    }),
};
