-- Playground: one console-owned virtual key per gateway, used to call the
-- gateway's /v1 surface on behalf of team members (the master key is
-- rejected there). Minted on first use by the console server.
--
--   * Sealed like gateway_secrets: base64(iv || ciphertext || tag) under
--     CONSOLE_ENCRYPTION_KEY, so the database alone cannot recover the key.
--   * RLS enabled with NO policies: service role only.
--   * Removing a gateway from the console cascades the row away; the key
--     itself stays on the gateway (the console never mutates a gateway on
--     removal, ADR 010).

create table public.playground_keys (
  gateway_id uuid primary key references public.gateways (id) on delete cascade,
  -- Gateway-side virtual key id.
  key_id text not null,
  key_ciphertext text not null,
  created_at timestamptz not null default now()
);

alter table public.playground_keys enable row level security;
-- playground_keys: no policies on purpose — service role only.
