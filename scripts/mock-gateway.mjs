#!/usr/bin/env node
/**
 * Mock Lumen gateway for console development: implements just enough of the
 * admin API surface (crates/server/src/admin.rs) and the /v1 surface the
 * Playground calls, to exercise every console screen without building the
 * Rust gateway.
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
/** Plaintext virtual key → key id, for /v1 auth. Rotation replaces the entry. */
const plaintexts = new Map();
const mintPlaintext = (keyId) => {
  for (const [plaintext, owner] of plaintexts) if (owner === keyId) plaintexts.delete(plaintext);
  const plaintext = `fg-${randomBytes(32).toString("hex")}`;
  plaintexts.set(plaintext, keyId);
  return plaintext;
};

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
id = "gpt-4o-mini"
capabilities = [ "chat" ]
cost_per_1m_input = 0.15
cost_per_1m_output = 0.6
fallbacks = [ "claude-sonnet-5" ]

[[providers.models]]
id = "budget-capped"
capabilities = [ "chat" ]

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

[[providers]]
name = "cohere"
kind = "cohere"
api_key_env = "COHERE_API_KEY"

[[providers.models]]
id = "rerank-v3"
capabilities = [ "rerank" ]

[[providers]]
name = "typesafe"
kind = "typesafe"
api_key_env = "TYPESAFE_API_KEY"

[[providers.models]]
id = "jev"
capabilities = [ "systemone" ]
`;
const configHash = () => createHash("sha256").update(configToml).digest("hex");

// Outbound budget webhooks (ADR 011): one receiver per gateway, managed via
// GET/PUT/DELETE /admin/webhooks and PUT/DELETE /admin/webhooks/signing-key.
// Seeded as if the operator had a [webhooks] block in the config file, so the
// console's "the stored row will override the file" warning is exercisable.
// A PUT flips `source` to "database" — persistently, like the real gateway.
const WEBHOOK_EVENT_KINDS = [
  "budget.threshold",
  "budget.exhausted",
  "key.disabled",
  "key.rotated",
  "key.deleted",
];
const webhookState = {
  enabled: true,
  source: "config",
  settings: {
    url: "https://billing.example.com/lumen/events",
    signing_key_env: null,
    events: ["budget.threshold", "budget.exhausted"],
    thresholds: [50, 80, 95],
    channel_capacity: 1024,
    timeout_ms: 5000,
    max_attempts: 5,
    retry_base_ms: 500,
  },
  signing_key_stored: false,
  updated_at: now() - 86_400 * 3,
};
const webhookDoc = () => ({
  enabled: webhookState.enabled,
  source: webhookState.source,
  ...(webhookState.enabled
    ? { settings: webhookState.settings, updated_at: webhookState.updated_at }
    : {}),
  signed: webhookState.signing_key_stored || Boolean(webhookState.settings?.signing_key_env),
  signing_key_stored: webhookState.signing_key_stored,
});
function validateWebhookSettings(body) {
  if (typeof body.url !== "string" || !/^https?:\/\/.+/.test(body.url)) {
    return "`url` must start with http:// or https://";
  }
  const events = body.events ?? ["budget.threshold", "budget.exhausted", "key.disabled"];
  if (!Array.isArray(events) || events.length === 0) {
    return "`events` must not be empty";
  }
  for (const event of events) {
    if (!WEBHOOK_EVENT_KINDS.includes(event)) return `unknown event kind '${event}'`;
  }
  const thresholds = body.thresholds ?? [50, 80, 95];
  if (events.includes("budget.threshold") && thresholds.length === 0) {
    return "`thresholds` must not be empty when budget.threshold is enabled";
  }
  for (const threshold of thresholds) {
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
      return "`thresholds` entries must be integers in 1..=100";
    }
  }
  for (const [field, fallback] of [
    ["channel_capacity", 1024],
    ["timeout_ms", 5000],
    ["max_attempts", 5],
    ["retry_base_ms", 500],
  ]) {
    const value = body[field] ?? fallback;
    if (!Number.isInteger(value) || value <= 0) {
      return `\`${field}\` must be a positive integer`;
    }
  }
  return null;
}

const MODELS = ["gpt-4o", "claude-sonnet-5", "text-embedding-3-small", "rerank-v3"];
const PROVIDERS = ["openai", "anthropic", "cohere"];

function usageGroups(groupBy) {
  const dims = {
    model: MODELS,
    model_used: MODELS,
    provider: PROVIDERS,
    capability: ["chat", "embed", "rerank", "systemone"],
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

// ---------------------------------------------------------------------------
// Public /v1 surface (lumen crates/server/src/app.rs), just enough for the
// console Playground. Virtual keys minted above authenticate here; the model
// list is read back from the stored config so pickers and /v1/models agree.
//
// Scripted behaviours for exercising the console:
//   * `gpt-4o-mini` is always served by its fallback (x-lumen-model-used).
//   * `budget-capped` answers 402 LM-4001, as an exhausted key would.
//   * a chat message containing "/error" fails mid-stream with LM-3010.
//   * a chat message containing "/markdown" gets a Markdown-rich reply.
//   * streams emit one token every 200 ms and log `client aborted` on a
//     disconnect before [DONE].

const v1Error = (res, status, code, message, type = "invalid_request") =>
  json(res, status, { error: { code, message, type } });

/** Models parsed from the stored TOML: [{ id, capabilities, fallbacks, provider }]. */
function configuredModels() {
  const models = [];
  let provider = null;
  for (const block of configToml.split(/^\[\[/m).slice(1)) {
    const field = (name) => block.match(new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m"))?.[1];
    const list = (name) =>
      [...(block.match(new RegExp(`^${name}\\s*=\\s*\\[([^\\]]*)\\]`, "m"))?.[1] ?? "").matchAll(
        /"([^"]*)"/g,
      )].map((match) => match[1]);
    if (block.startsWith("providers]]")) provider = field("name");
    if (block.startsWith("providers.models]]")) {
      models.push({ id: field("id"), capabilities: list("capabilities"), fallbacks: list("fallbacks"), provider });
    }
  }
  return models;
}

function resolveModel(res, modelId, capability) {
  const model = configuredModels().find((entry) => entry.id === modelId);
  if (!model) {
    v1Error(res, 404, "LM-2001", `model '${modelId}' not found`);
    return null;
  }
  if (!model.capabilities.includes(capability)) {
    v1Error(res, 400, "LM-2002", `model '${modelId}' does not support capability '${capability}'`);
    return null;
  }
  if (model.id === "budget-capped") {
    v1Error(res, 402, "LM-4001", "budget exceeded for this key");
    return null;
  }
  return model;
}

const servedBy = (model) => (model.id === "gpt-4o-mini" ? model.fallbacks[0] : model.id);
const countTokens = (text) => Math.max(1, Math.ceil(String(text).length / 4));

/** Deterministic pseudo-random number in [0, 1) from a string. */
function unit(text) {
  const digest = createHash("sha256").update(text).digest();
  return digest.readUInt32BE(0) / 2 ** 32;
}

function chatReply(model, messages) {
  const last = [...messages].reverse().find((message) => message.role === "user");
  const said = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");
  if (said.includes("/markdown")) {
    return [
      `## Rotating a key on ${servedBy(model)}`,
      "",
      "Rotation issues a **new plaintext** and invalidates the old one *immediately*:",
      "",
      "1. Open **API Keys**",
      "2. Pick the key, then `Rotate`",
      "3. Update your clients",
      "",
      "```bash",
      "curl -X POST $LUMEN_URL/admin/keys/$KEY_ID/rotate \\",
      '  -H "Authorization: Bearer $LUMEN_MASTER_KEY"',
      "```",
      "",
      "| Field | Kept |",
      "|---|---|",
      "| budget | yes |",
      "| plaintext | no |",
      "",
      "> The old key stops working on the next request.",
    ].join("\n");
  }
  return `Mock reply from ${servedBy(model)} on "${name}". You said: "${said.slice(0, 200)}". ` +
    `This conversation has ${messages.length} message(s).`;
}

async function handleChat(req, res, body) {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return v1Error(res, 400, "LM-1001", "`messages` must not be empty");
  }
  const model = resolveModel(res, body.model, "chat");
  if (!model) return;
  const reply = chatReply(model, body.messages);
  const promptTokens = body.messages.reduce((sum, message) => sum + countTokens(message.content ?? ""), 0);
  const usage = {
    prompt_tokens: promptTokens,
    completion_tokens: countTokens(reply),
    total_tokens: promptTokens + countTokens(reply),
  };
  const id = `chatcmpl-${randomBytes(6).toString("hex")}`;
  const created = now();
  const modelUsed = servedBy(model);

  if (!body.stream) {
    res.writeHead(200, { "content-type": "application/json", "x-lumen-model-used": modelUsed });
    return res.end(
      JSON.stringify({
        id,
        object: "chat.completion",
        created,
        model: modelUsed,
        choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
        usage,
      }),
    );
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "x-lumen-model-used": modelUsed,
  });
  const chunk = (delta, extra = {}) =>
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: modelUsed,
      choices: [{ index: 0, delta, finish_reason: null }],
      ...extra,
    })}\n\n`;
  const tokens = reply.match(/\S+\s*/g) ?? [reply];
  const failAt = reply.includes("/error") ? Math.floor(tokens.length / 2) : -1;
  let closed = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      closed = true;
      console.log(`[${name}] client aborted chat stream ${id}`);
    }
  });
  res.write(chunk({ role: "assistant", content: "" }));
  for (let index = 0; index < tokens.length; index++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (closed) return;
    if (index === failAt) {
      res.write(
        `data: ${JSON.stringify({
          error: { code: "LM-3010", message: "upstream ended the stream without a terminator", type: "upstream_error" },
        })}\n\n`,
      );
      return res.end();
    }
    if (index === 2) res.write(": ping\n\n");
    res.write(chunk({ content: tokens[index] }));
  }
  res.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: modelUsed,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage,
    })}\n\n`,
  );
  res.write("data: [DONE]\n\n");
  res.end();
}

function handleEmbeddings(res, body) {
  const inputs = typeof body.input === "string" ? [body.input] : body.input;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return v1Error(res, 400, "LM-1001", "`input` must not be empty");
  }
  const model = resolveModel(res, body.model, "embed");
  if (!model) return;
  const dimensions = Number(body.dimensions) || 16;
  const data = inputs.map((text, index) => ({
    object: "embedding",
    index,
    embedding: Array.from({ length: dimensions }, (_, dim) =>
      Number((unit(`${text}#${dim}`) * 2 - 1).toFixed(6)),
    ),
  }));
  const tokens = inputs.reduce((sum, text) => sum + countTokens(text), 0);
  res.writeHead(200, { "content-type": "application/json", "x-lumen-model-used": servedBy(model) });
  res.end(
    JSON.stringify({
      object: "list",
      model: servedBy(model),
      data,
      usage: { prompt_tokens: tokens, total_tokens: tokens, estimated: true },
    }),
  );
}

function handleRerank(res, body) {
  if (typeof body.query !== "string" || !body.query.trim()) {
    return v1Error(res, 400, "LM-1001", "`query` must not be empty");
  }
  if (!Array.isArray(body.documents) || body.documents.length === 0) {
    return v1Error(res, 400, "LM-2010", "`documents` must not be empty");
  }
  const model = resolveModel(res, body.model, "rerank");
  if (!model) return;
  const words = new Set(body.query.toLowerCase().split(/\W+/).filter(Boolean));
  const results = body.documents
    .map((document, index) => {
      const text = typeof document === "string" ? document : String(document?.text ?? "");
      const overlap = text.toLowerCase().split(/\W+/).filter((word) => words.has(word)).length;
      const score = Math.min(0.999, overlap * 0.3 + unit(`${body.query}|${text}`) * 0.1);
      return {
        index,
        relevance_score: Number(score.toFixed(4)),
        ...(body.return_documents ? { document: { text } } : {}),
      };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, body.top_n ?? body.documents.length);
  const tokens = countTokens(body.query) + body.documents.reduce((sum, doc) => sum + countTokens(JSON.stringify(doc)), 0);
  res.writeHead(200, { "content-type": "application/json", "x-lumen-model-used": servedBy(model) });
  res.end(JSON.stringify({ results, usage: { search_units: 1, total_tokens: tokens, tokens_estimated: true } }));
}

function handleSystemOne(res, body) {
  if (body.state === undefined || body.state === null) {
    return v1Error(res, 400, "LM-1001", "`state` is required");
  }
  if (!body.questions || typeof body.questions !== "object" || Array.isArray(body.questions)) {
    return v1Error(res, 400, "LM-1001", "`questions` must be an object");
  }
  if (Object.keys(body.questions).length === 0) {
    return v1Error(res, 400, "LM-2011", "`questions` must not be empty");
  }
  const model = resolveModel(res, body.model, "systemone");
  if (!model) return;
  const state = typeof body.state === "string" ? body.state : JSON.stringify(body.state);
  const answers = {};
  for (const [questionId, question] of Object.entries(body.questions)) {
    const seed = `${state}|${questionId}`;
    if (question?.type === "noul") {
      answers[questionId] = { type: "noul", noul: Number(unit(seed).toFixed(3)) };
    } else if (question?.type === "choice") {
      const options = Object.keys(question.criteria ?? {});
      if (options.length === 0) {
        return v1Error(res, 400, "LM-1001", `question \`${questionId}\`: choice needs 1 to 255 options, got 0`);
      }
      const weights = options.map((option) => unit(`${seed}|${option}`) + 0.05);
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const probabilities = Object.fromEntries(
        options.map((option, index) => [option, Number((weights[index] / total).toFixed(3))]),
      );
      const choice = options[weights.indexOf(Math.max(...weights))];
      answers[questionId] = {
        type: "choice",
        choice,
        probabilities,
        confidence: Number((0.5 + unit(`${seed}|confidence`) / 2).toFixed(3)),
      };
    } else if (question?.type === "score") {
      const levels = Array.isArray(question.criteria) ? question.criteria : [];
      if (levels.length === 0) {
        return v1Error(res, 400, "LM-1001", `question \`${questionId}\`: score needs 1 to 10 levels, got 0`);
      }
      const level = Math.floor(unit(seed) * levels.length);
      answers[questionId] = {
        type: "score",
        score: level + 1,
        legend: levels[level],
        confidence: Number((0.5 + unit(`${seed}|confidence`) / 2).toFixed(3)),
      };
    } else {
      return v1Error(res, 400, "LM-1001", `question \`${questionId}\`: unknown type '${question?.type}'`);
    }
  }
  res.writeHead(200, { "content-type": "application/json", "x-lumen-model-used": servedBy(model) });
  res.end(
    JSON.stringify({
      model: `${servedBy(model)}-2026-09`,
      answers,
      usage: { input_tokens: countTokens(state) + 40, output_tokens: 0, estimated: true },
    }),
  );
}

async function handleV1(req, res, path) {
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  const record = keys.get(plaintexts.get(bearer));
  const usable =
    record &&
    record.deleted_at === null &&
    !record.disabled &&
    (record.expires_at === null || record.expires_at > now());
  if (!usable) return v1Error(res, 401, "LM-4004", "authentication required");

  if (path === "/v1/models" && req.method === "GET") {
    return json(res, 200, {
      object: "list",
      data: configuredModels().map((model) => ({
        id: model.id,
        object: "model",
        owned_by: model.provider,
        capabilities: model.capabilities,
        modalities: ["text"],
      })),
    });
  }
  if (req.method !== "POST") return v1Error(res, 404, "LM-1003", "not found");
  const body = await readBody(req);
  if (path === "/v1/chat/completions") return handleChat(req, res, body);
  if (path === "/v1/embeddings") return handleEmbeddings(res, body);
  if (path === "/v1/rerank") return handleRerank(res, body);
  if (path === "/v1/systemone") return handleSystemOne(res, body);
  return v1Error(res, 404, "LM-1003", "not found");
}

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

  if (path.startsWith("/v1/")) return handleV1(req, res, path);
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

  if (path === "/admin/webhooks") {
    if (req.method === "GET") return json(res, 200, webhookDoc());
    if (req.method === "PUT") {
      const invalid = validateWebhookSettings(body);
      if (invalid) return lmError(res, 400, invalid);
      webhookState.settings = {
        url: body.url,
        signing_key_env: body.signing_key_env ?? null,
        events: body.events ?? ["budget.threshold", "budget.exhausted", "key.disabled"],
        thresholds: body.thresholds ?? [50, 80, 95],
        channel_capacity: body.channel_capacity ?? 1024,
        timeout_ms: body.timeout_ms ?? 5000,
        max_attempts: body.max_attempts ?? 5,
        retry_base_ms: body.retry_base_ms ?? 500,
      };
      webhookState.enabled = true;
      webhookState.source = "database";
      webhookState.updated_at = now();
      return json(res, 200, webhookDoc());
    }
    if (req.method === "DELETE") {
      webhookState.enabled = false;
      webhookState.source = "database";
      webhookState.settings = null;
      return json(res, 204);
    }
  }

  if (path === "/admin/webhooks/signing-key") {
    if (req.method === "PUT") {
      if (!body.secret?.trim()) return lmError(res, 400, "`secret` must not be empty");
      webhookState.signing_key_stored = true;
      return json(res, 204);
    }
    if (req.method === "DELETE") {
      webhookState.signing_key_stored = false;
      return json(res, 204);
    }
  }

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
    return json(res, 201, { key: mintPlaintext(record.id), ...record });
  }

  if (segments[1] === "keys" && segments[2]) {
    const record = keys.get(segments[2]);
    const missing = !record || record.deleted_at !== null;
    if (segments[3] === "rotate" && req.method === "POST") {
      if (missing) return lmError(res, 400, `unknown key id '${segments[2]}'`);
      return json(res, 200, { key: mintPlaintext(record.id), ...record });
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
