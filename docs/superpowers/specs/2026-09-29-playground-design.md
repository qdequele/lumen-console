# Playground: test every gateway endpoint with the configured models

- Status: approved in conversation, pending written-spec review
- Date: 2026-09-29
- Repo: `lumen-console` (no gateway change)

## Goal

A per-gateway **Playground** tab where any team member can send real requests
to each `/v1` endpoint of that gateway, using the models the gateway is
configured with, and see exactly what came back: body, status, LM error code,
latency, the model that actually served the call, and token counts.

Success criteria:

- Chat (streaming and non-streaming), embeddings, rerank, SystemOne and the
  models list are all callable from the console.
- Model pickers only offer models that have the matching capability.
- Streaming chat renders token by token, and Stop aborts the upstream call.
- No key material ever reaches the browser.

## Decisions taken

| Question | Decision |
|---|---|
| Which key calls `/v1`? | A console-owned **playground virtual key**, minted automatically per gateway, stored sealed. |
| Who may send requests? | **Every team role**, viewers included. |
| Limits on the playground key | **None** (no `budget_max`, no `rpm_limit`). Admins can add limits or disable it from the Keys tab. |
| UI shape | **One purpose-built form per endpoint + a shared inspector.** No raw JSON editing in v1. |

Context: the gateway's `/v1` surface accepts only virtual keys
(`require_virtual_key`, lumen `crates/server/src/auth.rs`); the master key the
console holds is rejected there. Gateways sit on a private network (ADR 010),
so the browser cannot call them directly: every call goes through a console
route handler.

## 1. Architecture and data flow

```
Browser (Playground tab) --POST /api/gateways/[id]/v1/<endpoint>--> console route handler
      ^  streamed body + selected headers                    | 1. membership check (any role)
      +------------------------------------------------------| 2. get-or-mint playground key
                                                              | 3. forward body verbatim --> gateway /v1/<endpoint>
```

### 1.1 Key storage

New migration `supabase/migrations/20260929000000_playground_keys.sql`:

```sql
create table public.playground_keys (
  gateway_id uuid primary key references public.gateways (id) on delete cascade,
  key_id text not null,            -- gateway-side virtual key id
  key_ciphertext text not null,    -- sealSecret(plaintext), base64(iv || ct || tag)
  created_at timestamptz not null default now()
);
alter table public.playground_keys enable row level security;
-- no policies on purpose: service role only, like gateway_secrets.
```

The plaintext is sealed with the existing `sealSecret` / `openSecret`
(`src/lib/server/crypto.ts`, AES-256-GCM under `CONSOLE_ENCRYPTION_KEY`).

### 1.2 Get-or-mint (`src/lib/server/playground.ts`)

`playgroundKey(conn): Promise<string>`:

1. Read the row for `conn.id` with the service role. If present, return
   `openSecret(key_ciphertext)`.
2. Otherwise mint: `POST /admin/keys` with the master key and body
   `{"name": "lumen-console-playground"}` (no limits).
3. Insert the row with `on conflict (gateway_id) do nothing`, then re-read.
4. If the re-read row's `key_id` is not the one just minted (lost a race with
   a concurrent first request), `DELETE /admin/keys/{minted id}` on the
   gateway (best effort) and return the winner's key.
5. If the insert fails, `DELETE` the minted key on the gateway (best effort)
   and throw a 500.

`forgetPlaygroundKey(gatewayId, keyId)` deletes the row only if it still holds
that `key_id` (so a concurrent re-mint is not clobbered).

Minting runs for any role: it is the console's own key, never shown to the
caller, never rotatable by a viewer.

### 1.3 Proxy route (`src/app/api/gateways/[id]/v1/[...path]/route.ts`)

- **Membership:** `connectGateway(id, { admin: false })`. Unknown gateway or
  non-member: 404, as elsewhere.
- **Allowlist:** `POST chat/completions`, `POST embeddings`, `POST rerank`,
  `POST systemone`, `GET models`. Anything else: 404.
- **Request:** the body is read once as text and forwarded unchanged. The
  console sets `Authorization: Bearer <playground key>`,
  `Content-Type: application/json` and
  `x-lumen-metadata: {"source":"console-playground","user":"<supabase user id>"}`
  (ADR 002: flat object, well under the 16-key / 4 KiB bounds). Browser-sent
  `Authorization`, `x-lumen-metadata` and `cf-aig-metadata` are never
  forwarded; no other browser header is forwarded either.
- **Upstream fetch:** its own `fetch`, NOT `lumenFetch` (whose 10 s total
  timeout would cut long generations). The only abort source is
  `request.signal`. `cache: "no-store"`.
- **Response:** `new Response(upstream.body, { status, headers })`, streaming
  the upstream body through with no buffering. Relayed headers:
  `content-type` and `x-lumen-model-used` only (`content-length` and
  `content-encoding` are dropped: Node's fetch has already decoded the body).
  When the upstream `content-type` is `text/event-stream`, add
  `Cache-Control: no-cache, no-transform` (so the standalone server's gzip
  does not buffer frames) and `X-Accel-Buffering: no` (for an nginx in front).
- **Cancellation:** returning the upstream body as the response stream means a
  browser abort cancels the stream, which closes the upstream connection;
  `request.signal` is also passed to the upstream `fetch`. Whether Next 16.3
  fires `request.signal` on client disconnect is verified with the mock
  gateway, not assumed.
- **Self-heal:** if the gateway answers `401` with code `LM-4004` (playground
  key deleted, disabled or expired on the gateway), call
  `forgetPlaygroundKey`, mint again and retry **exactly once**. A second 401
  is relayed as-is. Safe for streams: a 401 always precedes any body bytes.
- **Transport failure:** `502 {"error": "gateway unreachable: ...", "source": "console"}`.

### 1.4 Model pickers

Built from the existing `useGatewayConfig(gatewayId)` (`GET
/api/gateways/[id]/config`): every model of every provider, grouped by
capability (`chat`, `embed`, `rerank`, `systemone`).

### 1.5 Keys tab

The key named `lumen-console-playground` gets a `playground` badge in
`keys-panel.tsx`, so operators do not mistake it for a customer key.

### 1.6 Deployment notes

- Vercel functions stream, but are capped by their maximum duration (300 s by
  default). Only extremely long generations are affected.
- The pre-existing ADR 010 constraint still applies: a Vercel-hosted console
  only reaches gateways whose URL is publicly routable.

## 2. UI

All co-located under `src/app/(app)/gateways/[id]/`.

- **Navigation:** `app-shell.tsx` gains `{ tab: "playground", label:
  "Playground", icon: <FlaskConical /> }` between Providers and Webhooks;
  `page.tsx` adds `"playground"` to `PANELS`. Visible to every role.
- **`playground-panel.tsx`:** sub-tabs **Chat, Embeddings, Rerank, SystemOne,
  Models**. Form on the left, inspector on the right at `lg` and up, stacked
  below.
- **State:** per-sub-tab inputs and last result in a Zustand store
  (`playground/store.ts`), in memory only, keyed by gateway id. Switching
  sub-tabs does not lose a conversation; a reload does.
- **Model picker (`playground/model-select.tsx`):** filtered by capability.
  Empty state: "No `<capability>` model on this gateway", linking to
  `?tab=providers`.

### 2.1 Forms (`playground/*-form.tsx`)

- **Chat:** system prompt, user/assistant turns, stream toggle (default on),
  `temperature`, `max_tokens`. Send becomes Stop while running. Replies render
  as `whitespace-pre-wrap` plain text. A follow-up turn sends the whole
  conversation.
- **Embeddings:** textarea, one input per line (sent as `input: string[]`).
  Shows vector count, dimensions, the first 8 values per vector, and a copy
  button for the full vector.
- **Rerank:** `query`, documents one per line, optional `top_n`. Table of
  rank, original index, score (with a bar), document.
- **SystemOne:** `state` textarea with a "send as JSON" switch (sent as a
  string when off; parsed JSON when on, with an inline parse error), and a
  `questions` JSON editor prefilled with the example from lumen
  `docs/systemone/systemone.md`. Answers: `noul` as one probability bar,
  `choice` as one bar per option plus confidence, any other type as raw JSON.
- **Models:** `GET /v1/models` as a table (id, capabilities): what the
  playground key actually sees.

### 2.2 Inspector (`playground/inspector.tsx`)

Shared by all sub-tabs, fed a `PlaygroundResult`:

- status badge, and the LM error code when present;
- total latency; for streams, "TTFT (via console)" (browser-measured, so it
  includes the console hop, and is labelled as such);
- model used, from `x-lumen-model-used`, badged **fallback** when it differs
  from the requested model;
- tokens from the response `usage`, badged **estimated** when the gateway
  flags it (`estimated` / `tokens_estimated`);
- tabs: **Request** (JSON sent), **Response** (JSON received; for streams the
  assembled message plus the chunk count), **curl** (registered gateway URL,
  key shown as `$LUMEN_API_KEY`).

### 2.3 Client plumbing (`playground/client.ts`)

- Non-streaming calls: TanStack `useMutation`.
- Streaming chat: `useChatStream` hook, `fetch` + `AbortController` + an SSE
  parser (`src/lib/sse.ts`) that handles frames split across chunks, skips
  comment/heartbeat lines, stops at `data: [DONE]`, and surfaces a
  `data: {"error": {...}}` frame as a mid-stream error.
- After every call, invalidate the `["usage", gatewayId]` queries so the Usage
  tab reflects the spend.

## 3. Errors, security, testing

### 3.1 Errors (always shown in the inspector)

| Situation | What the user sees |
|---|---|
| Gateway 4xx / 5xx | Status and body relayed verbatim, LM code shown |
| Gateway unreachable | `502`, labelled as a console-side failure |
| Mint rejected by the gateway | `502 could not provision playground key` plus the gateway's code |
| Minted but DB write failed | `500`; the minted key is deleted on the gateway (best effort) |
| `401 LM-4004` | One silent re-mint and retry; a second 401 is shown as-is |
| Mid-stream error frame | Partial reply kept, error appended in the inspector |
| SystemOne `state` / `questions` not valid JSON | Inline field error, request not sent |

### 3.2 Security

- The playground key's plaintext is never returned to the browser, logged, or
  included in an error body.
- Only the five allowlisted endpoints are reachable through the proxy.
- `Authorization` and metadata headers are always set by the console, never
  taken from the browser, so attribution cannot be spoofed.
- Removing a gateway from the console cascades away its `playground_keys` row;
  the key itself stays on the gateway (the console never mutates a gateway on
  removal, ADR 010).

### 3.3 Testing

- **Vitest** added as a dev dependency with a `test` script. Tests are written
  before the code for:
  - `playground.ts`: first mint, reuse, lost race cleans up, DB-write failure
    rolls back, `forgetPlaygroundKey` only drops a matching `key_id`;
  - the proxy: allowlist, header filtering (no browser `Authorization` /
    metadata forwarded), SSE `no-transform` headers, one retry on
    `LM-4004` and no second retry;
  - `sse.ts`: split frames, heartbeats, `[DONE]`, error frames.
- **Mock gateway** (`scripts/mock-gateway.mjs`): add `/v1/models`,
  `/v1/chat/completions` (JSON and a slow SSE stream, one token every 200 ms,
  logging `client aborted` on disconnect), `/v1/embeddings`, `/v1/rerank`,
  `/v1/systemone`, a model that answers with a fallback `x-lumen-model-used`,
  and a model that answers a budget error.
- **End to end:** drive the playground in the browser against the mock
  gateway: all five sub-tabs, the fallback badge, the budget error, and Stop
  mid-stream (the mock logs the abort).
- **Gate:** `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`.

### 3.4 Docs

README: a "Playground" section and a `/v1/[...path]` row in the route table.

## Out of scope (v1)

Raw JSON body editing, Markdown rendering of chat replies, persisting
conversations, image inputs, per-user playground keys, and any gateway-side
change.
