import "server-only";
import { openSecret, sealSecret } from "@/lib/server/crypto";
import type { GatewayConnection } from "@/lib/server/gateways";
import { LumenError, lumenFetch } from "@/lib/server/lumen";
import { supabaseService } from "@/lib/server/supabase";
import { PLAYGROUND_KEY_NAME } from "@/lib/playground";
import type { CreatedKey } from "@/lib/types";

/**
 * The gateway's /v1 surface only accepts virtual keys, so the Playground
 * calls it with a console-owned key minted once per gateway. Its plaintext
 * is sealed like a master key and never leaves the console server.
 */
export { PLAYGROUND_KEY_NAME };

export interface PlaygroundKeyRow {
  gateway_id: string;
  /** Gateway-side virtual key id. */
  key_id: string;
  /** sealSecret(plaintext). */
  key_ciphertext: string;
}

/** Persistence for `playground_keys`, injectable so tests need no database. */
export interface PlaygroundKeyStore {
  read(gatewayId: string): Promise<PlaygroundKeyRow | null>;
  /** Insert unless a row already exists for the gateway (`on conflict do nothing`). */
  insert(row: PlaygroundKeyRow): Promise<void>;
  /** Delete the gateway's row only if it still holds `keyId`. */
  deleteIfMatches(gatewayId: string, keyId: string): Promise<void>;
}

export interface PlaygroundKey {
  keyId: string;
  key: string;
}

export function supabaseKeyStore(): PlaygroundKeyStore {
  const table = () => supabaseService().from("playground_keys");
  return {
    async read(gatewayId) {
      const { data, error } = await table()
        .select("gateway_id, key_id, key_ciphertext")
        .eq("gateway_id", gatewayId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PlaygroundKeyRow | null) ?? null;
    },
    async insert(row) {
      const { error } = await table().upsert(row, {
        onConflict: "gateway_id",
        ignoreDuplicates: true,
      });
      if (error) throw new Error(error.message);
    },
    async deleteIfMatches(gatewayId, keyId) {
      const { error } = await table().delete().eq("gateway_id", gatewayId).eq("key_id", keyId);
      if (error) throw new Error(error.message);
    },
  };
}

/** Best effort: a leftover unused key on the gateway is harmless. */
async function deleteGatewayKey(conn: GatewayConnection, keyId: string): Promise<void> {
  await lumenFetch<void>(conn, `/admin/keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

/** The gateway's playground key, minted on first use. */
export async function playgroundKey(
  conn: GatewayConnection,
  store: PlaygroundKeyStore = supabaseKeyStore(),
): Promise<PlaygroundKey> {
  const existing = await store.read(conn.id);
  if (existing) return { keyId: existing.key_id, key: openSecret(existing.key_ciphertext) };

  let minted: CreatedKey;
  try {
    minted = await lumenFetch<CreatedKey>(conn, "/admin/keys", {
      method: "POST",
      body: JSON.stringify({ name: PLAYGROUND_KEY_NAME }),
    });
  } catch (error) {
    if (error instanceof LumenError) {
      throw new LumenError(`could not provision playground key: ${error.message}`, 502, error.code);
    }
    throw error;
  }

  let winner: PlaygroundKeyRow | null;
  try {
    await store.insert({
      gateway_id: conn.id,
      key_id: minted.id,
      key_ciphertext: sealSecret(minted.key),
    });
    winner = await store.read(conn.id);
  } catch (error) {
    await deleteGatewayKey(conn, minted.id);
    const detail = error instanceof Error ? error.message : String(error);
    throw new LumenError(`could not store playground key: ${detail}`, 500);
  }
  if (!winner) {
    await deleteGatewayKey(conn, minted.id);
    throw new LumenError("could not store playground key", 500);
  }
  if (winner.key_id !== minted.id) {
    // A concurrent first request stored its key first: use that one.
    await deleteGatewayKey(conn, minted.id);
    return { keyId: winner.key_id, key: openSecret(winner.key_ciphertext) };
  }
  return { keyId: minted.id, key: minted.key };
}

/** Drop the stored key, unless a concurrent re-mint already replaced it. */
export async function forgetPlaygroundKey(
  gatewayId: string,
  keyId: string,
  store: PlaygroundKeyStore = supabaseKeyStore(),
): Promise<void> {
  await store.deleteIfMatches(gatewayId, keyId);
}
