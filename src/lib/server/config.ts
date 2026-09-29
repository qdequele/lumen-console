import "server-only";
import { parse, stringify, TomlDate } from "smol-toml";
import { isValidReleaseDate } from "@/lib/models";
import type { GatewayConnection } from "@/lib/server/gateways";
import { lumenFetch, LumenError } from "@/lib/server/lumen";
import type { KeySource, ModelBody, ModelConfig, ProviderConfig } from "@/lib/types";

/**
 * Gateway config access, per ADR 010 §5 as shipped in lumen PR #141
 * (crates/server/src/admin.rs):
 *
 *   GET /admin/config  → JSON `{ config: "<toml>", hash: "<blake3 hex>",
 *                        key_sources: { <provider>: KeySource } }`; the
 *                        file's bytes verbatim, never the merged in-memory
 *                        config (env overrides stay env-only). `key_sources`
 *                        is newer and absent on older gateways.
 *   PUT /admin/config  → TOML body + `If-Match: "<hash>"`; the gateway
 *                        stages the bytes, validates (parse + registry
 *                        build) BEFORE writing, backs up the old file,
 *                        renames atomically and requests a hot reload.
 *                        412 LM-1004 on a stale hash, 400 LM-1001 on an
 *                        invalid document.
 *
 * The hash is an opaque concurrency token — the console never computes it,
 * only echoes it. Every mutation is read → parse → change the providers
 * array → stringify → conditional PUT, so two operators editing
 * concurrently fail loudly instead of silently losing an edit.
 * Programmatic writes drop TOML comments — that is inherent to rewriting
 * the file and is the documented cost of console-managed providers (keep a
 * GitOps copy if comments matter).
 */

export interface GatewayConfigDocument {
  /** Full parsed config (server/auth/... preserved verbatim on write). */
  root: Record<string, unknown>;
  providers: ProviderConfig[];
  hash: string;
  toml: string;
  keySources?: Record<string, KeySource>;
}

interface RawModel {
  id?: unknown;
  upstream_id?: unknown;
  capabilities?: unknown;
  modalities?: unknown;
  cost_per_1m_input?: unknown;
  cost_per_1m_output?: unknown;
  fallbacks?: unknown;
  release_date?: unknown;
  [key: string]: unknown;
}

interface RawProvider {
  name?: unknown;
  kind?: unknown;
  api_key_env?: unknown;
  base_url?: unknown;
  models?: unknown;
  [key: string]: unknown;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** A quoted `"2024-08-06"` or a bare TOML date `2024-08-06`: lumen takes both. */
function asReleaseDate(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof TomlDate && value.isDate()) return value.toISOString();
  return undefined;
}

function parseModel(raw: RawModel): ModelConfig {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    upstream_id: typeof raw.upstream_id === "string" ? raw.upstream_id : undefined,
    capabilities: asStringArray(raw.capabilities) ?? [],
    modalities: asStringArray(raw.modalities),
    cost_per_1m_input:
      typeof raw.cost_per_1m_input === "number" ? raw.cost_per_1m_input : undefined,
    cost_per_1m_output:
      typeof raw.cost_per_1m_output === "number" ? raw.cost_per_1m_output : undefined,
    fallbacks: asStringArray(raw.fallbacks),
    release_date: asReleaseDate(raw.release_date),
  };
}

function parseProvider(raw: RawProvider): ProviderConfig {
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    kind: typeof raw.kind === "string" ? raw.kind : "",
    api_key_env: typeof raw.api_key_env === "string" ? raw.api_key_env : undefined,
    base_url: typeof raw.base_url === "string" ? raw.base_url : undefined,
    models: Array.isArray(raw.models)
      ? (raw.models as RawModel[]).map(parseModel)
      : [],
  };
}

/** `GET /admin/config` wire shape (admin.rs `ConfigDocument`). */
interface ConfigDocumentWire {
  config: string;
  hash: string;
  key_sources?: Record<string, KeySource>;
}

export async function fetchConfig(conn: GatewayConnection): Promise<GatewayConfigDocument> {
  let wire: ConfigDocumentWire;
  try {
    wire = await lumenFetch<ConfigDocumentWire>(conn, "/admin/config");
  } catch (error) {
    if (error instanceof LumenError && error.status === 404) {
      throw new LumenError(
        "this gateway does not expose GET /admin/config (ADR 010); upgrade it to manage providers from the console",
        501,
      );
    }
    throw error;
  }
  let root: Record<string, unknown>;
  try {
    root = parse(wire.config) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new LumenError(`gateway config is not parseable TOML: ${detail}`, 502);
  }
  const providers = Array.isArray(root.providers)
    ? (root.providers as RawProvider[]).map(parseProvider)
    : [];
  return {
    root,
    providers,
    hash: wire.hash,
    toml: wire.config,
    keySources: wire.key_sources,
  };
}

export async function writeConfig(
  conn: GatewayConnection,
  document: GatewayConfigDocument,
): Promise<void> {
  try {
    await lumenFetch<void>(conn, "/admin/config", {
      method: "PUT",
      body: stringify(document.root),
      headers: {
        "Content-Type": "application/toml",
        "If-Match": `"${document.hash}"`,
      },
    });
  } catch (error) {
    // 412 LM-1004: another operator applied a config since our read. Relay
    // as a 409 the client hooks surface as "reload and retry".
    if (error instanceof LumenError && error.status === 412) {
      throw new LumenError(
        "the gateway config changed while you were editing; reload and retry",
        409,
        error.code,
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Validation shared by the provider/model routes. The gateway re-validates
// authoritatively on PUT; these checks exist to answer with a precise 400
// instead of a generic rejection.

export const CAPABILITIES = ["chat", "embed", "rerank", "systemone"] as const;
export const MODALITIES = ["text", "image"] as const;

export function validateModel(model: ModelConfig, allModelIds: Set<string>): string | null {
  if (!model.id.trim()) return "`id` must not be empty";
  if (model.capabilities.length === 0) return "`capabilities` must not be empty";
  for (const capability of model.capabilities) {
    if (!(CAPABILITIES as readonly string[]).includes(capability)) {
      return `invalid capability "${capability}": expected chat, embed, rerank or systemone`;
    }
  }
  for (const modality of model.modalities ?? []) {
    if (!(MODALITIES as readonly string[]).includes(modality)) {
      return `invalid modality "${modality}": expected text or image`;
    }
  }
  for (const price of [model.cost_per_1m_input, model.cost_per_1m_output]) {
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
      return "prices must be non-negative finite numbers";
    }
  }
  if (model.release_date && !isValidReleaseDate(model.release_date)) {
    return `invalid release date "${model.release_date}": expected a real date YYYY-MM-DD from 1970-01-01`;
  }
  for (const fallback of model.fallbacks ?? []) {
    if (fallback === model.id) return "a model cannot fall back to itself";
    if (!allModelIds.has(fallback)) {
      return `fallback "${fallback}" does not match any model id on this gateway`;
    }
  }
  return null;
}

/** `""` (or whitespace) means unset. */
function trimmedOrUndefined(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

/** `[]` means unset, like an absent key in the TOML. */
function nonEmpty(list: string[] | undefined): string[] | undefined {
  return list && list.length > 0 ? list : undefined;
}

/** A POST body as a new model: cleared values become absent. */
export function modelFromBody(body: ModelBody): ModelConfig {
  return {
    id: body.id?.trim() ?? "",
    upstream_id: trimmedOrUndefined(body.upstream_id),
    capabilities: body.capabilities ?? [],
    modalities: nonEmpty(body.modalities),
    cost_per_1m_input: body.cost_per_1m_input ?? undefined,
    cost_per_1m_output: body.cost_per_1m_output ?? undefined,
    fallbacks: nonEmpty(body.fallbacks),
    release_date: trimmedOrUndefined(body.release_date),
  };
}

/**
 * A PATCH body applied to `current`: a missing key keeps the value, the
 * clear markers of {@link ModelBody} remove it.
 */
export function mergeModel(current: ModelConfig, body: Partial<ModelBody>): ModelConfig {
  const pick = <T>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);
  return {
    id: body.id?.trim() || current.id,
    upstream_id:
      body.upstream_id === undefined ? current.upstream_id : trimmedOrUndefined(body.upstream_id),
    capabilities: body.capabilities ?? current.capabilities,
    modalities: body.modalities === undefined ? current.modalities : nonEmpty(body.modalities),
    cost_per_1m_input: pick(body.cost_per_1m_input, current.cost_per_1m_input) ?? undefined,
    cost_per_1m_output: pick(body.cost_per_1m_output, current.cost_per_1m_output) ?? undefined,
    fallbacks: body.fallbacks === undefined ? current.fallbacks : nonEmpty(body.fallbacks),
    release_date:
      body.release_date === undefined
        ? current.release_date
        : trimmedOrUndefined(body.release_date),
  };
}

/** A model as stored back into the TOML document: no undefined values. */
export function toRawModel(model: ModelConfig): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    id: model.id,
    capabilities: model.capabilities,
  };
  if (model.upstream_id) raw.upstream_id = model.upstream_id;
  if (model.modalities && model.modalities.length > 0) raw.modalities = model.modalities;
  if (model.cost_per_1m_input !== undefined) raw.cost_per_1m_input = model.cost_per_1m_input;
  if (model.cost_per_1m_output !== undefined) raw.cost_per_1m_output = model.cost_per_1m_output;
  if (model.fallbacks && model.fallbacks.length > 0) raw.fallbacks = model.fallbacks;
  if (model.release_date) raw.release_date = model.release_date;
  return raw;
}

export function toRawProvider(provider: ProviderConfig): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    name: provider.name,
    kind: provider.kind,
    models: provider.models.map(toRawModel),
  };
  if (provider.api_key_env) raw.api_key_env = provider.api_key_env;
  if (provider.base_url) raw.base_url = provider.base_url;
  return raw;
}

/** Every model id on the gateway, across all providers. */
export function allModelIds(providers: ProviderConfig[]): Set<string> {
  return new Set(providers.flatMap((provider) => provider.models.map((model) => model.id)));
}
