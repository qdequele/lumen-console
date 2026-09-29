import "server-only";
import type { GatewayConnection } from "@/lib/server/gateways";
import { LumenError } from "@/lib/server/lumen";
import {
  forgetPlaygroundKey,
  playgroundKey,
  type PlaygroundKey,
} from "@/lib/server/playground";

/** The /v1 endpoints the Playground may reach, and the one method each accepts. */
const ENDPOINTS: Record<string, "GET" | "POST"> = {
  "chat/completions": "POST",
  embeddings: "POST",
  rerank: "POST",
  systemone: "POST",
  models: "GET",
};

/** Headers relayed back to the browser; everything else stays on the server. */
const RELAYED_HEADERS = ["content-type", "x-lumen-model-used"];

/** Invalid, disabled, expired or deleted virtual key (lumen auth.rs). */
const KEY_REJECTED = "LM-4004";

export interface PlaygroundKeys {
  get(conn: GatewayConnection): Promise<PlaygroundKey>;
  forget(gatewayId: string, keyId: string): Promise<void>;
}

const defaultKeys: PlaygroundKeys = {
  get: (conn) => playgroundKey(conn),
  forget: (gatewayId, keyId) => forgetPlaygroundKey(gatewayId, keyId),
};

/** The allowlisted endpoint for a method + catch-all path, or null. */
export function playgroundEndpoint(method: string, path: string[]): string | null {
  const endpoint = path.join("/");
  return Object.hasOwn(ENDPOINTS, endpoint) && ENDPOINTS[endpoint] === method ? endpoint : null;
}

function consoleError(status: number, error: string, code?: string): Response {
  return Response.json({ error, ...(code ? { code } : {}), source: "console" }, { status });
}

async function isKeyRejected(response: Response): Promise<{ rejected: boolean; text: string }> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: { code?: string } };
    return { rejected: body.error?.code === KEY_REJECTED, text };
  } catch {
    return { rejected: false, text };
  }
}

function relayHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of RELAYED_HEADERS) {
    const value = upstream.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (headers.get("content-type")?.startsWith("text/event-stream")) {
    // Keep compression and reverse proxies from buffering SSE frames.
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no");
  }
  return headers;
}

/**
 * Forward one Playground call to the gateway's /v1 surface with the
 * console-owned playground key. The body is forwarded verbatim; the browser's
 * own headers never are, so neither the key nor the attribution can be
 * spoofed. The response body is streamed through unbuffered.
 */
export async function proxyToGateway(
  request: Request,
  args: { conn: GatewayConnection; userId: string; endpoint: string },
  keys: PlaygroundKeys = defaultKeys,
): Promise<Response> {
  const { conn, userId, endpoint } = args;
  const method = ENDPOINTS[endpoint];
  // Read once: a retry after a re-mint must send the same bytes.
  const body = method === "POST" ? await request.text() : undefined;
  const metadata = JSON.stringify({ source: "console-playground", user: userId });

  const send = (key: string) =>
    // Not lumenFetch: its 10 s total timeout would cut long generations. The
    // only abort source is the browser disconnecting.
    fetch(`${conn.url}/v1/${endpoint}`, {
      method,
      body,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "x-lumen-metadata": metadata,
      },
      signal: request.signal,
      cache: "no-store",
    });

  try {
    let key = await keys.get(conn);
    let upstream = await send(key.key);
    if (upstream.status === 401) {
      // A 401 always precedes any body bytes, so this is safe for streams.
      const first = await isKeyRejected(upstream);
      if (!first.rejected) {
        return new Response(first.text, { status: 401, headers: relayHeaders(upstream.headers) });
      }
      await keys.forget(conn.id, key.keyId);
      key = await keys.get(conn);
      upstream = await send(key.key);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: relayHeaders(upstream.headers),
    });
  } catch (error) {
    if (error instanceof LumenError) return consoleError(error.status, error.message, error.code);
    const detail = error instanceof Error ? error.message : String(error);
    return consoleError(502, `gateway unreachable: ${detail}`);
  }
}
