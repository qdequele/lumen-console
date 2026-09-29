# Lumen Console

Multi-tenant operator console for any number of [Lumen](../lumen) gateways, built
on [ADR 010 — Operator console and fleet control](../lumen/docs/adr/010-operator-console-and-fleet-control.md):
anyone can create an account, form teams, register remote gateways, and
administer them through each gateway's existing `/admin` API.

## What it does

- **Accounts & teams** — email/password signup (Supabase Auth), teams with
  `owner` / `admin` / `viewer` roles, email invitations claimed automatically
  on the invitee's next sign-in.
- **Gateway registry** — register a gateway with its admin URL and master
  key; the key is sealed with AES-256-GCM on the console server before it is
  stored, and is never shown or sent to a browser again.
- **Gateways** — every gateway across your teams with reachability,
  provider health probes and last-24h spend/requests/tokens.
- **Usage** — per-gateway dashboards over `GET /admin/usage`: cost over
  time (bucketed server-side from the raw export), filters by key, group,
  model, provider and capability, and CSV export through the
  cursor-paginated `GET /admin/usage/export` (ADR 010).
- **Per-gateway management** — keys (create with one-time plaintext, budgets,
  limits, enable/disable, rotate, grant top-ups, soft-delete), budget groups
  (ADR 009), provider health, encrypted provider-key rotation, and outbound
  budget webhooks (ADR 011): configure the receiver URL, events, thresholds
  and delivery knobs, and rotate the write-only HMAC signing secret — the
  secret is never rendered, logged, or returned to a browser.
- **Providers & models** — structured CRUD over the gateway's config
  (ADR 010 §5, `GET`/`PUT /admin/config`): add/edit/remove providers and
  their models with console-side validation (globally unique model ids,
  capability/modality checks, fallback-chain integrity — renames rewrite
  fallbacks, deletes of a fallback target are refused). Every write is
  optimistic-concurrency-guarded by the config content hash (`If-Match`),
  so concurrent edits fail with 409 instead of losing changes.
- **Playground** — send real requests to each `/v1` endpoint of a gateway
  (chat with streaming and Stop, embeddings, rerank, SystemOne, the models
  list) with the models it is configured with, and inspect status, LM error
  code, latency (split into time to first token and generation, with
  tokens/sec for streams), the model that actually served the call
  (fallbacks are badged), token counts, the request and response as a
  collapsible JSON tree, and an equivalent `curl`. Chat replies render as
  Markdown (toggle for raw). Open to every role.
  Calls go through the console with a console-owned **playground virtual
  key** (`lumen-console-playground`), minted on first use without limits and
  stored sealed in `playground_keys`; its plaintext never reaches a browser.
  Admins can cap or disable it from the API Keys tab; a disabled or deleted
  key is re-minted once, transparently. Playground calls are tagged
  `x-lumen-metadata: {"source":"console-playground","user":"<user id>"}`
  and count toward the gateway's usage.

  | Route (under `/api/gateways/[id]`) | Methods |
  |---|---|
  | `/config` | `GET` (providers + hash) |
  | `/config/providers` | `POST` |
  | `/config/providers/[name]` | `PATCH`, `DELETE` |
  | `/config/providers/[name]/models` | `POST` |
  | `/config/providers/[name]/models/[modelId]` | `PATCH`, `DELETE` |
  | `/webhooks` | `GET` (viewer-safe), `PUT`, `DELETE` |
  | `/webhooks/signing-key` | `PUT`, `DELETE` |
  | `/v1/[...path]` | Playground proxy: `POST chat/completions`, `embeddings`, `rerank`, `systemone`; `GET models` |

  Uses the gateway's `GET`/`PUT /admin/config` (shipped in lumen PR #141):
  `GET` returns `{ config, hash }` (the file verbatim + BLAKE3 hash), `PUT`
  takes the TOML body with `If-Match`, validates and builds a candidate
  registry before an atomic write, then hot-reloads. The console answers
  501 with a clear message against older gateways. Programmatic writes
  drop TOML comments — keep a GitOps copy if comments matter.

## Architecture

```
Browser ── Next.js (App Router) ── /api/* route handlers ──► Lumen gateways (/admin)
                │                        │
                │  session cookie        │ service role (secrets only)
                ▼                        ▼
            Supabase Auth          Supabase Postgres
                                   teams / team_members / invitations
                                   gateways / gateway_secrets / playground_keys (RLS)
```

- **Gateways stay the source of truth** for keys, budgets and usage (ADR 010).
  The console's database is a registry: teams, memberships and gateway
  endpoints. No spend or key material is stored beyond the sealed master key.
- **Row level security everywhere.** All user-facing queries run under the
  caller's session. `gateway_secrets` has RLS enabled with **no policies** —
  only the console server (service role) can read it, and only after
  membership was verified through a session-scoped query. Master keys are
  additionally encrypted under `CONSOLE_ENCRYPTION_KEY`, so the database
  alone cannot recover one.
- **Roles**: `owner`/`admin` mutate (register gateways, manage keys, invite),
  `viewer` gets read-only dashboards. Enforced server-side per gateway.
- **A project is pinned to one gateway** (ADR 010), so keys, groups and
  usage are always viewed on their home gateway.

## Development

```bash
pnpm install
supabase start        # local Postgres + Auth (Docker)
cp .env.example .env.local   # paste the keys `supabase start` printed
openssl rand -base64 32      # -> CONSOLE_ENCRYPTION_KEY
pnpm dev
pnpm test             # Vitest unit tests
```

Migrations live in `supabase/migrations/` and are applied by
`supabase start` / `supabase migration up`.

### Without a real gateway

A mock gateway implementing the same admin API surface, plus the `/v1`
endpoints the Playground calls, ships in `scripts/mock-gateway.mjs`:

```bash
node scripts/mock-gateway.mjs 15091 mock-master-eu eu-west
```

Register `http://127.0.0.1:15091` with master key `mock-master-eu` in the UI.
For the Playground, the mock has scripted cases: `gpt-4o-mini` is always
served by its fallback, `budget-capped` answers `402 LM-4001`, a chat message
containing `/error` fails mid-stream, one containing `/markdown` gets a
Markdown-rich reply, and streams send one token every
200 ms and log `client aborted` when Stop disconnects them.

## Production

- Create a Supabase project, run the migrations (`supabase db push`), and set
  the four env vars from `.env.example`.
- Build with the multi-stage `Dockerfile` (standalone Next.js output).
- Run the console on infrastructure with **private network reachability to
  the gateways** (WireGuard/Tailscale) — never expose gateway admin ports to
  the public internet (ADR 010 §2).
- Email confirmation for signups is a Supabase Auth setting; enable it (plus
  SMTP) on hosted projects.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; reads `gateway_secrets` and `playground_keys`, resolves member emails |
| `CONSOLE_ENCRYPTION_KEY` | 32-byte base64 key sealing gateway master keys and playground keys |
