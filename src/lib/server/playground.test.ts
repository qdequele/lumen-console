import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openSecret, sealSecret } from "@/lib/server/crypto";
import type { GatewayConnection } from "@/lib/server/gateways";
import { LumenError } from "@/lib/server/lumen";
import {
  PLAYGROUND_KEY_NAME,
  describeStoreError,
  forgetPlaygroundKey,
  playgroundKey,
  type PlaygroundKeyRow,
  type PlaygroundKeyStore,
} from "@/lib/server/playground";

const conn: GatewayConnection = { id: "gw-1", url: "http://gateway.test", masterKey: "master" };

beforeAll(() => {
  process.env.CONSOLE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** In-memory store with the same `on conflict do nothing` semantics as the table. */
function memoryStore(initial?: PlaygroundKeyRow) {
  const rows = new Map<string, PlaygroundKeyRow>();
  if (initial) rows.set(initial.gateway_id, initial);
  const store: PlaygroundKeyStore & { rows: typeof rows } = {
    rows,
    read: vi.fn(async (gatewayId: string) => rows.get(gatewayId) ?? null),
    insert: vi.fn(async (row: PlaygroundKeyRow) => {
      if (!rows.has(row.gateway_id)) rows.set(row.gateway_id, row);
    }),
    deleteIfMatches: vi.fn(async (gatewayId: string, keyId: string) => {
      if (rows.get(gatewayId)?.key_id === keyId) rows.delete(gatewayId);
    }),
  };
  return store;
}

interface Call {
  method: string;
  url: string;
  body?: unknown;
}

/** Stub the gateway admin API: POST /admin/keys mints `key_<n>` / `fg-<n>`. */
function stubGateway(options: { mintStatus?: number } = {}) {
  const calls: Call[] = [];
  let counter = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        method,
        url: input,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (method === "POST" && input.endsWith("/admin/keys")) {
        if (options.mintStatus && options.mintStatus !== 201) {
          return new Response(
            JSON.stringify({ error: { code: "LM-1001", message: "nope" } }),
            { status: options.mintStatus, headers: { "content-type": "application/json" } },
          );
        }
        counter += 1;
        return new Response(
          JSON.stringify({ id: `key_${counter}`, name: PLAYGROUND_KEY_NAME, key: `fg-${counter}` }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "DELETE") return new Response(null, { status: 204 });
      return new Response("not found", { status: 404 });
    }),
  );
  return calls;
}

describe("playgroundKey", () => {
  it("mints a key without limits on first use and stores it sealed", async () => {
    const calls = stubGateway();
    const store = memoryStore();

    const result = await playgroundKey(conn, store);

    expect(result).toEqual({ keyId: "key_1", key: "fg-1" });
    expect(calls).toEqual([
      { method: "POST", url: "http://gateway.test/admin/keys", body: { name: PLAYGROUND_KEY_NAME } },
    ]);
    const row = store.rows.get("gw-1");
    expect(row?.key_id).toBe("key_1");
    expect(row?.key_ciphertext).not.toContain("fg-1");
    expect(openSecret(row!.key_ciphertext)).toBe("fg-1");
  });

  it("reuses the stored key without calling the gateway", async () => {
    const calls = stubGateway();
    const store = memoryStore({
      gateway_id: "gw-1",
      key_id: "key_old",
      key_ciphertext: sealSecret("fg-old"),
    });

    expect(await playgroundKey(conn, store)).toEqual({ keyId: "key_old", key: "fg-old" });
    expect(calls).toEqual([]);
  });

  it("deletes its own minted key when a concurrent request won the insert", async () => {
    const calls = stubGateway();
    const store = memoryStore();
    // The row is empty on the first read, but another request inserts first.
    vi.mocked(store.read).mockResolvedValueOnce(null);
    store.rows.set("gw-1", {
      gateway_id: "gw-1",
      key_id: "key_winner",
      key_ciphertext: sealSecret("fg-winner"),
    });

    expect(await playgroundKey(conn, store)).toEqual({ keyId: "key_winner", key: "fg-winner" });
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST http://gateway.test/admin/keys",
      "DELETE http://gateway.test/admin/keys/key_1",
    ]);
  });

  it("rolls back the minted key when the database write fails", async () => {
    const calls = stubGateway();
    const store = memoryStore();
    vi.mocked(store.insert).mockRejectedValueOnce(new Error("db down"));

    await expect(playgroundKey(conn, store)).rejects.toMatchObject({ status: 500 });
    expect(calls.map((call) => call.method)).toEqual(["POST", "DELETE"]);
    expect(store.rows.size).toBe(0);
  });

  it("reports a gateway that refuses to mint as a 502 with the gateway's code", async () => {
    stubGateway({ mintStatus: 403 });
    const store = memoryStore();

    const failure = await playgroundKey(conn, store).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LumenError);
    expect(failure).toMatchObject({ status: 502, code: "LM-1001" });
    expect((failure as Error).message).toMatch(/could not provision playground key/);
  });

  it("never puts the plaintext key in an error message", async () => {
    stubGateway();
    const store = memoryStore();
    vi.mocked(store.insert).mockRejectedValueOnce(new Error("db down"));

    const failure = await playgroundKey(conn, store).catch((error: unknown) => error);
    expect((failure as Error).message).not.toContain("fg-1");
  });
});

describe("forgetPlaygroundKey", () => {
  it("drops the row when it still holds that key id", async () => {
    const store = memoryStore({ gateway_id: "gw-1", key_id: "key_a", key_ciphertext: "x" });
    await forgetPlaygroundKey("gw-1", "key_a", store);
    expect(store.rows.size).toBe(0);
  });

  it("keeps a row that a concurrent re-mint already replaced", async () => {
    const store = memoryStore({ gateway_id: "gw-1", key_id: "key_b", key_ciphertext: "x" });
    await forgetPlaygroundKey("gw-1", "key_a", store);
    expect(store.rows.get("gw-1")?.key_id).toBe("key_b");
  });
});

describe("describeStoreError", () => {
  it("points at the migration when the table is missing", () => {
    expect(
      describeStoreError({
        code: "PGRST205",
        message: "Could not find the table 'public.playground_keys' in the schema cache",
      }),
    ).toBe(
      "the playground_keys table does not exist: apply supabase/migrations/20260929000000_playground_keys.sql (supabase db push)",
    );
  });

  it("passes other database errors through", () => {
    expect(describeStoreError({ code: "42501", message: "permission denied" })).toBe(
      "permission denied",
    );
  });
});
