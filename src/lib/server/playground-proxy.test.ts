import { afterEach, describe, expect, it, vi } from "vitest";
import type { GatewayConnection } from "@/lib/server/gateways";
import { LumenError } from "@/lib/server/lumen";
import type { PlaygroundKey } from "@/lib/server/playground";
import {
  playgroundEndpoint,
  proxyToGateway,
  type PlaygroundKeys,
} from "@/lib/server/playground-proxy";

const conn: GatewayConnection = { id: "gw-1", url: "http://gateway.test", masterKey: "master" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeKeys(...keys: PlaygroundKey[]): PlaygroundKeys & {
  get: ReturnType<typeof vi.fn>;
  forget: ReturnType<typeof vi.fn>;
} {
  let index = 0;
  return {
    get: vi.fn(async () => keys[Math.min(index++, keys.length - 1)]),
    forget: vi.fn(async () => undefined),
  };
}

interface Seen {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
  signal: AbortSignal | null | undefined;
}

function stubUpstream(...responses: (() => Response)[]): Seen[] {
  const seen: Seen[] = [];
  let index = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      seen.push({
        url: input,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body === undefined ? undefined : String(init.body),
        signal: init?.signal,
      });
      return responses[Math.min(index++, responses.length - 1)]();
    }),
  );
  return seen;
}

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function browserRequest(method: string, body?: string, headers: Record<string, string> = {}) {
  return new Request("http://console.test/api/gateways/gw-1/v1/chat/completions", {
    method,
    body,
    headers,
  });
}

describe("playgroundEndpoint", () => {
  it.each([
    ["POST", ["chat", "completions"], "chat/completions"],
    ["POST", ["embeddings"], "embeddings"],
    ["POST", ["rerank"], "rerank"],
    ["POST", ["systemone"], "systemone"],
    ["GET", ["models"], "models"],
  ])("allows %s %s", (method, path, expected) => {
    expect(playgroundEndpoint(method, path)).toBe(expected);
  });

  it.each([
    ["GET", ["chat", "completions"]],
    ["POST", ["models"]],
    ["DELETE", ["embeddings"]],
    ["POST", ["completions"]],
    ["GET", ["..", "admin", "keys"]],
    ["GET", ["models", "extra"]],
    ["POST", []],
  ])("rejects %s %s", (method, path) => {
    expect(playgroundEndpoint(method, path)).toBeNull();
  });
});

describe("proxyToGateway", () => {
  it("forwards the body verbatim with console-set auth and metadata only", async () => {
    const seen = stubUpstream(() => jsonResponse(200, { ok: true }, { "x-lumen-model-used": "gpt-4o" }));
    const body = '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}';
    const request = browserRequest("POST", body, {
      authorization: "Bearer stolen",
      "x-lumen-metadata": '{"user":"someone-else"}',
      "cf-aig-metadata": '{"user":"someone-else"}',
      "x-custom": "1",
      cookie: "sb-access-token=abc",
    });

    const response = await proxyToGateway(
      request,
      { conn, userId: "user-1", endpoint: "chat/completions" },
      fakeKeys({ keyId: "key_1", key: "fg-1" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("x-lumen-model-used")).toBe("gpt-4o");
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("http://gateway.test/v1/chat/completions");
    expect(seen[0].method).toBe("POST");
    expect(seen[0].body).toBe(body);
    expect(seen[0].signal).toBe(request.signal);
    expect([...seen[0].headers.keys()].sort()).toEqual([
      "authorization",
      "content-type",
      "x-lumen-metadata",
    ]);
    expect(seen[0].headers.get("authorization")).toBe("Bearer fg-1");
    expect(JSON.parse(seen[0].headers.get("x-lumen-metadata")!)).toEqual({
      source: "console-playground",
      user: "user-1",
    });
  });

  it("sends GET models without a body", async () => {
    const seen = stubUpstream(() => jsonResponse(200, { object: "list", data: [] }));
    await proxyToGateway(
      browserRequest("GET"),
      { conn, userId: "user-1", endpoint: "models" },
      fakeKeys({ keyId: "key_1", key: "fg-1" }),
    );
    expect(seen[0]).toMatchObject({ url: "http://gateway.test/v1/models", method: "GET", body: undefined });
  });

  it("relays only content-type and x-lumen-model-used", async () => {
    stubUpstream(() =>
      jsonResponse(200, {}, {
        "x-lumen-model-used": "claude-sonnet-5",
        "set-cookie": "a=b",
        "content-encoding": "gzip",
        "x-internal": "secret",
      }),
    );
    const response = await proxyToGateway(
      browserRequest("POST", "{}"),
      { conn, userId: "user-1", endpoint: "embeddings" },
      fakeKeys({ keyId: "key_1", key: "fg-1" }),
    );
    expect([...response.headers.keys()].sort()).toEqual(["content-type", "x-lumen-model-used"]);
  });

  it("adds no-transform headers to event streams and streams the body through", async () => {
    stubUpstream(
      () =>
        new Response('data: {"n":1}\n\ndata: [DONE]\n\n', {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const response = await proxyToGateway(
      browserRequest("POST", '{"stream":true}'),
      { conn, userId: "user-1", endpoint: "chat/completions" },
      fakeKeys({ keyId: "key_1", key: "fg-1" }),
    );
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(await response.text()).toBe('data: {"n":1}\n\ndata: [DONE]\n\n');
  });

  it("relays gateway errors verbatim", async () => {
    stubUpstream(() =>
      jsonResponse(402, { error: { code: "LM-4001", message: "budget exceeded for this key" } }),
    );
    const response = await proxyToGateway(
      browserRequest("POST", "{}"),
      { conn, userId: "user-1", endpoint: "chat/completions" },
      fakeKeys({ keyId: "key_1", key: "fg-1" }),
    );
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: { code: "LM-4001", message: "budget exceeded for this key" },
    });
  });

  it("re-mints once and retries with the same body on 401 LM-4004", async () => {
    const seen = stubUpstream(
      () => jsonResponse(401, { error: { code: "LM-4004", message: "key disabled" } }),
      () => jsonResponse(200, { ok: true }),
    );
    const keys = fakeKeys({ keyId: "key_1", key: "fg-1" }, { keyId: "key_2", key: "fg-2" });

    const response = await proxyToGateway(
      browserRequest("POST", '{"input":["a"]}'),
      { conn, userId: "user-1", endpoint: "embeddings" },
      keys,
    );

    expect(response.status).toBe(200);
    expect(keys.forget).toHaveBeenCalledExactlyOnceWith("gw-1", "key_1");
    expect(seen.map((call) => call.headers.get("authorization"))).toEqual([
      "Bearer fg-1",
      "Bearer fg-2",
    ]);
    expect(seen[1].body).toBe('{"input":["a"]}');
  });

  it("relays a second 401 as-is without retrying again", async () => {
    const seen = stubUpstream(() =>
      jsonResponse(401, { error: { code: "LM-4004", message: "key disabled" } }),
    );
    const keys = fakeKeys({ keyId: "key_1", key: "fg-1" }, { keyId: "key_2", key: "fg-2" });

    const response = await proxyToGateway(
      browserRequest("POST", "{}"),
      { conn, userId: "user-1", endpoint: "embeddings" },
      keys,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "LM-4004", message: "key disabled" },
    });
    expect(seen).toHaveLength(2);
    expect(keys.forget).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 401 with another code", async () => {
    const seen = stubUpstream(() =>
      jsonResponse(401, { error: { code: "LM-1001", message: "some other 401" } }),
    );
    const keys = fakeKeys({ keyId: "key_1", key: "fg-1" });
    const response = await proxyToGateway(
      browserRequest("POST", "{}"),
      { conn, userId: "user-1", endpoint: "embeddings" },
      keys,
    );
    expect(response.status).toBe(401);
    expect(seen).toHaveLength(1);
    expect(keys.forget).not.toHaveBeenCalled();
  });

  it("answers 502 with a console source when the gateway is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const response = await proxyToGateway(
      browserRequest("POST", "{}"),
      { conn, userId: "user-1", endpoint: "embeddings" },
      fakeKeys({ keyId: "key_1", key: "fg-1" }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "gateway unreachable: fetch failed",
      source: "console",
    });
  });

  it("reports a key provisioning failure with its status and code, never the key", async () => {
    stubUpstream(() => jsonResponse(200, {}));
    const keys: PlaygroundKeys = {
      get: async () => {
        throw new LumenError("could not provision playground key: forbidden", 502, "LM-1001");
      },
      forget: async () => undefined,
    };
    const response = await proxyToGateway(
      browserRequest("POST", "{}"),
      { conn, userId: "user-1", endpoint: "embeddings" },
      keys,
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "could not provision playground key: forbidden",
      code: "LM-1001",
      source: "console",
    });
  });

  it("reports a key store failure as a 500 console error, not as an unreachable gateway", async () => {
    const seen = stubUpstream(() => jsonResponse(200, {}));
    const keys: PlaygroundKeys = {
      get: async () => {
        throw new Error("Could not find the table 'public.playground_keys' in the schema cache");
      },
      forget: async () => undefined,
    };
    const response = await proxyToGateway(
      browserRequest("POST", "{}"),
      { conn, userId: "user-1", endpoint: "embeddings" },
      keys,
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error:
        "could not load the playground key: Could not find the table 'public.playground_keys' in the schema cache",
      source: "console",
    });
    expect(seen).toHaveLength(0);
  });
});
