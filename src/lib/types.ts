/** Types mirrored from the Lumen gateway admin API (crates/server/src/admin.rs). */

export interface VirtualKeyRecord {
  id: string;
  name: string;
  group_id: string | null;
  budget_max: number | null;
  budget_spent: number;
  rpm_limit: number | null;
  tpm_limit: number | null;
  expires_at: number | null;
  disabled: boolean;
  created_at: number;
  deleted_at: number | null;
}

/** POST /admin/keys and POST /admin/keys/{id}/rotate response: record + one-time plaintext. */
export interface CreatedKey extends VirtualKeyRecord {
  key: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  budget_max: number | null;
  budget_spent: number;
  created_at: number;
  deleted_at: number | null;
}

export interface UsageAggregate {
  group: string;
  requests: number;
  requests_ok: number;
  requests_client_error: number;
  requests_server_error: number;
  tokens_in: number;
  tokens_out: number;
  tokens_total: number;
  estimated_requests: number;
  upstream_requests: number;
  search_units: number;
  media_items?: number;
  cost: number;
}

export type UsageGroupBy =
  | "model"
  | "model_used"
  | "provider"
  | "capability"
  | "key_id"
  | "group_id"
  | "status"
  | "total";

export interface UsageReport {
  since: number;
  until: number;
  group_by: UsageGroupBy;
  truncated: boolean;
  groups: UsageAggregate[];
}

export type ProviderHealthState = "up" | "down" | "unknown";

export interface ProviderStatus {
  status: ProviderHealthState;
  checked_at?: number;
  latency_ms?: number;
  detail?: string;
}

export type ProviderHealthMap = Record<string, ProviderStatus>;

export type TeamRole = "owner" | "admin" | "viewer";

export interface Team {
  id: string;
  name: string;
  created_at: string;
  /** The calling user's role in this team. */
  role: TeamRole;
}

export interface TeamMemberInfo {
  user_id: string;
  email: string;
  role: TeamRole;
  created_at: string;
}

export interface InvitationInfo {
  id: string;
  email: string;
  role: TeamRole;
  created_at: string;
}

/** What the browser is allowed to see about a gateway (no master key material). */
export interface GatewayPublic {
  id: string;
  name: string;
  region: string;
  url: string;
  team_id: string;
  team_name: string;
  /** The calling user's role in the owning team. */
  role: TeamRole;
}

/** Body accepted by POST /api/gateways. */
export interface NewGatewayBody {
  team_id: string;
  name: string;
  region?: string;
  url: string;
  /** Sent once over TLS, sealed server-side, never stored in the clear. */
  master_key: string;
}

/** Body accepted by PATCH /api/gateways/[id]. */
export interface GatewayUpdateBody {
  name?: string;
  region?: string;
  url?: string;
  /** When present, replaces the sealed master key. */
  master_key?: string;
}

export type GatewayReachability = "up" | "down";

export interface GatewaySnapshot extends GatewayPublic {
  reachable: GatewayReachability;
  /** Populated when reachable; absent otherwise. */
  providers?: ProviderHealthMap;
  /**
   * Last-24h totals from GET /admin/usage?group_by=total. `null` means the
   * call succeeded with no traffic; absent means it failed (or no master key).
   */
  usage24h?: UsageAggregate | null;
  /** Human-readable failure detail when the gateway is unreachable. */
  error?: string;
}

/** Error envelope the gateway returns ({"error": {"code": "LM-1001", "message": ...}}) or a flat message. */
export interface GatewayErrorBody {
  error?: { code?: string; message?: string } | string;
  message?: string;
}

export interface CurrentUser {
  id: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Gateway config: providers and their models (ADR 010 §5, GET/PUT
// /admin/config). `api_key_env` is the NAME of an env var — the config never
// contains key material, so it is safe to show and edit in the console.

export interface ModelConfig {
  /** The id clients send; unique across ALL providers on the gateway. */
  id: string;
  /** What the gateway sends upstream; defaults to `id`. */
  upstream_id?: string;
  /** Any of "chat" | "embed" | "rerank". */
  capabilities: string[];
  /** Input modalities; defaults to ["text"]. */
  modalities?: string[];
  cost_per_1m_input?: number;
  cost_per_1m_output?: number;
  /** Model ids tried in order when this provider fails. */
  fallbacks?: string[];
}

export interface ProviderConfig {
  /** Operator-chosen label, unique per gateway. */
  name: string;
  /** Built-in integration: openai | anthropic | google | ... */
  kind: string;
  /** Env var NAME holding the key on the gateway host (never the key). */
  api_key_env?: string;
  base_url?: string;
  models: ModelConfig[];
}

/**
 * Where a provider's API key resolves from on the gateway: its `api_key_env`
 * variable (which wins), a key stored via "Set API key", nowhere, or not
 * needed (keyless kinds such as Ollama).
 */
export type KeySource = "env" | "stored" | "missing" | "not_required";

/** GET /api/gateways/[id]/config response. */
export interface GatewayConfigInfo {
  /** Content hash of the config the providers were read from. */
  hash: string;
  providers: ProviderConfig[];
  /** Provider name → key source. Absent on gateways older than this field. */
  key_sources?: Record<string, KeySource>;
}

/** POST .../config/providers body. */
export interface NewProviderBody {
  name: string;
  kind: string;
  api_key_env?: string;
  base_url?: string;
}

/** PATCH .../config/providers/[name] body — only provided fields change. */
export interface ProviderPatchBody {
  kind?: string;
  api_key_env?: string | null;
  base_url?: string | null;
}

/** POST .../models and PATCH .../models/[modelId] body. */
export type ModelBody = ModelConfig;

// ---------------------------------------------------------------------------
// Outbound budget webhooks (ADR 011): one receiver per gateway, administered
// through GET/PUT/DELETE /admin/webhooks and PUT/DELETE
// /admin/webhooks/signing-key. The signing secret is write-only end to end —
// no route ever returns it, only `signed` / `signing_key_stored`.

export type WebhookEventKind =
  | "budget.threshold"
  | "budget.exhausted"
  | "key.disabled"
  | "key.rotated"
  | "key.deleted";

/** The full settings document — PUT /admin/webhooks replaces ALL of it. */
export interface WebhookSettings {
  url: string;
  /** Env var NAME holding the HMAC secret on the gateway host (never the secret). */
  signing_key_env: string | null;
  events: WebhookEventKind[];
  /** Budget percentages (1..=100); only meaningful with `budget.threshold`. */
  thresholds: number[];
  channel_capacity: number;
  timeout_ms: number;
  max_attempts: number;
  retry_base_ms: number;
}

/** Where the live settings came from: the admin API row or the config file. */
export type WebhookSource = "database" | "config";

/** GET /admin/webhooks response. `settings`/`updated_at` are absent when off. */
export interface WebhookConfigInfo {
  enabled: boolean;
  source: WebhookSource;
  settings?: WebhookSettings;
  /** Deliveries are HMAC-signed (a secret is stored or resolvable from env). */
  signed: boolean;
  signing_key_stored: boolean;
  updated_at?: number;
}

/** One raw usage_log row (GET /admin/usage/export). No prompt content by construction. */
export interface UsageRow {
  id: number;
  key_id: string | null;
  group_id: string | null;
  model: string;
  model_used: string;
  provider: string;
  capability: string;
  tokens_in: number;
  tokens_out: number;
  cached_tokens: number | null;
  reasoning_tokens: number | null;
  cache_write_tokens: number | null;
  search_units: number | null;
  media_count: number;
  media_bytes: number;
  estimated: boolean;
  cost: number;
  latency_ms: number;
  status: number;
  metadata: string | null;
  created_at: number;
}

/** GET /admin/usage/export response page. */
export interface UsageExportPage {
  since: number;
  until: number;
  rows: UsageRow[];
  next_cursor: number | null;
}

/** One group's series in GET /api/gateways/[id]/usage/timeseries. */
export interface TimeseriesGroup {
  /** The group value (a model id, provider name, … per the grouping). */
  name: string;
  /** Aligned to `timestamps`, one value per bucket. */
  cost: number[];
  requests: number[];
  tokens: number[];
}

/** Time-bucketed usage built from the raw export (ADR 010). */
export interface UsageTimeseries {
  since: number;
  until: number;
  /** Bucket width in seconds; timestamps are bucket starts. */
  bucket_secs: number;
  timestamps: number[];
  /** Ordered by total cost descending; the tail beyond the top N is "other". */
  groups: TimeseriesGroup[];
  /** True when the row cap was hit and later rows were not bucketed. */
  truncated: boolean;
}

/** Body accepted by POST /api/gateways/[id]/keys. */
export interface NewKeyBody {
  name: string;
  group_id?: string | null;
  budget_max?: number | null;
  rpm_limit?: number | null;
  tpm_limit?: number | null;
  expires_at?: number | null;
}

/** Body accepted by PATCH /api/gateways/[id]/keys/[keyId]. */
export interface KeyPatchBody {
  name?: string;
  group_id?: string | null;
  budget_max?: number | null;
  rpm_limit?: number | null;
  tpm_limit?: number | null;
  expires_at?: number | null;
  disabled?: boolean;
}

export interface NewGroupBody {
  name: string;
  budget_max?: number | null;
}

export interface GroupPatchBody {
  name?: string;
  budget_max?: number | null;
}

export interface GrantBody {
  amount: number;
}
