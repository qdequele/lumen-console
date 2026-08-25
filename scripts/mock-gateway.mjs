#!/usr/bin/env node
/**
 * Mock Lumen gateway for console development: implements just enough of the
 * admin API surface (crates/server/src/admin.rs) to exercise every console
 * screen without building the Rust gateway.
 *
 *   node scripts/mock-gateway.mjs <port> <master-key> [name]
 */
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";

const port = Number(process.argv[2] ?? 8081);
const masterKey = process.argv[3] ?? "mock-master";
const name = process.argv[4] ?? `mock-${port}`;

const now = () => Math.floor(Date.now() / 1000);
const id = (prefix) => `${prefix}_${randomBytes(6).toString("hex")}`;

const keys = new Map();
const groups = new Map();

const seedGroup = {
  id: id("grp"),
  name: "acme-corp",
  budget_max: 500,
  budget_spent: 132.4,
  created_at: now() - 86_400 * 12,
  deleted_at: null,
};
groups.set(seedGroup.id, seedGroup);
for (const [keyName, spent, max, groupId] of [
  ["search-prod", 41.2, 100, seedGroup.id],
  ["rag-pipeline", 12.7, null, null],
  ["chat-staging", 3.1, 25, null],
]) {
  const record = {
    id: id("key"),
    name: keyName,
    group_id: groupId,
    budget_max: max,
    budget_spent: spent,
    rpm_limit: keyName === "chat-staging" ? 60 : null,
    tpm_limit: null,
    expires_at: null,
    disabled: false,
    created_at: now() - 86_400 * 30,
    deleted_at: null,
  };
  keys.set(record.id, record);
}

// ADR 010 §5 as shipped in lumen PR #141: GET /admin/config returns JSON
// { config, hash } (the file verbatim plus a content hash); PUT takes the
// TOML body with If-Match and answers 412 LM-1004 on a stale hash. The mock
// stores the TOML verbatim and only checks the hash + non-emptiness; the
// real gateway builds a candidate registry before writing. The hash is an
// opaque token to the console, so the mock's sha256 stands in for blake3.
let configToml = `log_format = "pretty"

[server]
host = "0.0.0.0"
port = ${port}

[[providers]]
name = "openai"
kind = "openai"
api_key_env = "OPENAI_API_KEY"

[[providers.models]]
id = "gpt-4o"
upstream_id = "gpt-4o-2024-08-06"
capabilities = [ "chat" ]
cost_per_1m_input = 2.5
cost_per_1m_output = 10.0
fallbacks = [ "claude-sonnet-5" ]

[[providers.models]]
id = "text-embedding-3-small"
capabilities = [ "embed" ]

[[providers]]
name = "anthropic"
kind = "anthropic"
api_key_env = "ANTHROPIC_API_KEY"

[[providers.models]]
id = "claude-sonnet-5"
upstream_id = "claude-sonnet-5-latest"
capabilities = [ "chat" ]
cost_per_1m_input = 3.0
cost_per_1m_output = 15.0
`;
const configHash = () => createHash("sha256").update(configToml).digest("hex");

const MODELS = ["gpt-4o", "claude-sonnet-5", "text-embedding-3-small", "rerank-v3"];
const PROVIDERS = ["openai", "anthropic", "cohere"];

function usageGroups(groupBy) {
  const dims = {
    model: MODELS,
    model_used: MODELS,
    provider: PROVIDERS,
    capability: ["chat", "embed", "rerank"],
    key_id: [...keys.keys()],
    group_id: [...groups.keys()],
    status: ["200", "400", "429", "502"],
    total: ["total"],
  };
  return (dims[groupBy] ?? dims.model).map((group, index) => {
    const requests = Math.floor(5000 / (index + 1)) + port;
    const ok = Math.floor(requests * 0.94);
    return {
      group,
      requests,
      requests_ok: ok,
      requests_client_error: Math.floor(requests * 0.05),
      requests_server_error: requests - ok - Math.floor(requests * 0.05),
      tokens_in: requests * 350,
      tokens_out: requests * 120,
      tokens_total: requests * 470,
      estimated_requests: Math.floor(requests * 0.02),
      upstream_requests: Math.floor(requests * 0.98),
      search_units: 0,
      cost: Number((requests * 0.00042 * (index + 1)).toFixed(4)),
    };
  });
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const lmError = (res, status, message) =>
  json(res, status, { error: { code: "LM-1001", message } });

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const path = url.pathname;

  if (path === "/health") return json(res, 200, { status: "ok" });
  if (path === "/health/providers") {
    return json(
      res,
      200,
      Object.fromEntries(
        PROVIDERS.map((provider, index) => [
          provider,
          {
            status: index === 2 && port % 2 === 0 ? "down" : "up",
            checked_at: now() - 12,
            latency_ms: 40 + index * 35,
            detail: index === 2 && port % 2 === 0 ? "unreachable" : "reachable",
          },
        ]),
      ),
    );
  }

  if (!path.startsWith("/admin")) return lmError(res, 404, "not found");
  if (req.headers.authorization !== `Bearer ${masterKey}`) {
    return lmError(res, 401, "invalid master key");
  }

  if (path === "/admin/config") {
    if (req.method === "GET") {
      return json(res, 200, { config: configToml, hash: configHash() });
    }
    if (req.method === "PUT") {
      const expected = (req.headers["if-match"] ?? "").replaceAll('"', "");
      if (expected !== configHash()) {
        res.writeHead(412, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            error: {
              code: "LM-1004",
              message: "config changed since it was read; GET /admin/config and re-apply",
            },
          }),
        );
      }
      const text = await new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
      });
      if (!text.trim() || !text.includes("[[providers]]")) {
        return lmError(res, 400, "config validation failed: no [[providers]] block");
      }
      configToml = text;
      return json(res, 204);
    }
  }

  const body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : {};
  const segments = path.split("/").filter(Boolean); // ["admin", ...]

  if (path === "/admin/usage") {
    const groupBy = url.searchParams.get("group_by") ?? "model";
    const until = now();
    return json(res, 200, {
      since: until - 86_400,
      until,
      group_by: groupBy,
      truncated: false,
      groups: usageGroups(groupBy),
    });
  }

  // Cursor-paginated raw usage rows (ADR 010). Deterministic per id so
  // repeated exports of the same window agree with each other.
  if (path === "/admin/usage/export") {
    const until = Number(url.searchParams.get("until")) || now();
    const since = Number(url.searchParams.get("since")) || until - 86_400;
    const cursor = Number(url.searchParams.get("cursor")) || 0;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 1000, 10_000);
    const TOTAL_ROWS = 2500;
    const keyIds = [...keys.keys()];
    const rows = [];
    for (let rowId = cursor + 1; rowId <= TOTAL_ROWS && rows.length < limit; rowId++) {
      const caps = ["chat", "chat", "embed", "rerank"];
      rows.push({
        id: rowId,
        key_id: keyIds[rowId % keyIds.length] ?? null,
        group_id: rowId % 3 === 0 ? seedGroup.id : null,
        model: MODELS[rowId % MODELS.length],
        model_used: MODELS[rowId % MODELS.length],
        provider: PROVIDERS[rowId % PROVIDERS.length],
        capability: caps[rowId % caps.length],
        tokens_in: 200 + (rowId % 700),
        tokens_out: 50 + (rowId % 300),
        cached_tokens: null,
        reasoning_tokens: null,
        cache_write_tokens: null,
        search_units: null,
        media_count: 0,
        media_bytes: 0,
        estimated: rowId % 20 === 0,
        cost: Number(((rowId % 700) * 0.000004).toFixed(6)),
        latency_ms: 300 + (rowId % 900),
        status: rowId % 40 === 0 ? 502 : 200,
        metadata: null,
        created_at: since + Math.floor(((until - since) * rowId) / TOTAL_ROWS),
      });
    }
    const last = rows.at(-1);
    return json(res, 200, {
      since,
      until,
      rows,
      next_cursor: last && last.id < TOTAL_ROWS ? last.id : null,
    });
  }

  if (path === "/admin/keys" && req.method === "GET") {
    const include = url.searchParams.get("include_deleted") === "true";
    return json(res, 200, [...keys.values()].filter((key) => include || !key.deleted_at));
  }
  if (path === "/admin/keys" && req.method === "POST") {
    if (!body.name?.trim()) return lmError(res, 400, "`name` must not be empty");
    if (body.group_id && !groups.has(body.group_id)) {
      return lmError(res, 400, `unknown budget group '${body.group_id}'`);
    }
    const record = {
      id: id("key"),
      name: body.name,
      group_id: body.group_id ?? null,
      budget_max: body.budget_max ?? null,
      budget_spent: 0,
      rpm_limit: body.rpm_limit ?? null,
      tpm_limit: body.tpm_limit ?? null,
      expires_at: body.expires_at ?? null,
      disabled: false,
      created_at: now(),
      deleted_at: null,
    };
    keys.set(record.id, record);
    return json(res, 201, { key: `fg-${randomBytes(24).toString("hex")}`, ...record });
  }

  if (segments[1] === "keys" && segments[2]) {
    const record = keys.get(segments[2]);
    const missing = !record || record.deleted_at !== null;
    if (segments[3] === "rotate" && req.method === "POST") {
      if (missing) return lmError(res, 400, `unknown key id '${segments[2]}'`);
      return json(res, 200, { key: `fg-${randomBytes(24).toString("hex")}`, ...record });
    }
    if (segments[3] === "grant" && req.method === "POST") {
      if (missing) return lmError(res, 400, `unknown key id '${segments[2]}'`);
      if (!(body.amount > 0)) return lmError(res, 400, "grant `amount` must be positive");
      if (record.budget_max === null) {
        return lmError(res, 400, `'${segments[2]}' has no budget cap to grant to`);
      }
      record.budget_max += body.amount;
      return json(res, 200, record);
    }
    if (req.method === "PATCH") {
      if (missing) return lmError(res, 400, `unknown key id '${segments[2]}'`);
      for (const field of ["name", "group_id", "budget_max", "rpm_limit", "tpm_limit", "expires_at", "disabled"]) {
        if (field in body) record[field] = body[field];
      }
      return json(res, 200, record);
    }
    if (req.method === "DELETE") {
      if (missing) return lmError(res, 400, `unknown key id '${segments[2]}'`);
      record.deleted_at = now();
      return json(res, 204);
    }
  }

  if (path === "/admin/groups" && req.method === "GET") {
    const include = url.searchParams.get("include_deleted") === "true";
    return json(res, 200, [...groups.values()].filter((group) => include || !group.deleted_at));
  }
  if (path === "/admin/groups" && req.method === "POST") {
    if (!body.name?.trim()) return lmError(res, 400, "`name` must not be empty");
    const record = {
      id: id("grp"),
      name: body.name,
      budget_max: body.budget_max ?? null,
      budget_spent: 0,
      created_at: now(),
      deleted_at: null,
    };
    groups.set(record.id, record);
    return json(res, 201, record);
  }

  if (segments[1] === "groups" && segments[2]) {
    const record = groups.get(segments[2]);
    const missing = !record || record.deleted_at !== null;
    if (segments[3] === "grant" && req.method === "POST") {
      if (missing) return lmError(res, 400, `unknown group id '${segments[2]}'`);
      if (!(body.amount > 0)) return lmError(res, 400, "grant `amount` must be positive");
      if (record.budget_max === null) {
        return lmError(res, 400, `'${segments[2]}' has no budget cap to grant to`);
      }
      record.budget_max += body.amount;
      return json(res, 200, record);
    }
    if (req.method === "PATCH") {
      if (missing) return lmError(res, 400, `unknown group id '${segments[2]}'`);
      for (const field of ["name", "budget_max"]) {
        if (field in body) record[field] = body[field];
      }
      return json(res, 200, record);
    }
    if (req.method === "DELETE") {
      if (missing) return lmError(res, 400, `unknown group id '${segments[2]}'`);
      const members = [...keys.values()].filter(
        (key) => key.group_id === segments[2] && !key.deleted_at,
      );
      if (members.length > 0) {
        return lmError(
          res,
          400,
          `group '${segments[2]}' still has ${members.length} active member key(s); move or delete them first`,
        );
      }
      record.deleted_at = now();
      return json(res, 204);
    }
  }

  if (segments[1] === "provider-keys" && req.method === "PUT") {
    if (!body.key?.trim()) return lmError(res, 400, "`key` must not be empty");
    return json(res, 204);
  }

  return lmError(res, 404, "not found");
}).listen(port, () => {
  console.log(`mock gateway "${name}" listening on :${port} (master key: ${masterKey})`);
});
