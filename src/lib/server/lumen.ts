import "server-only";
import type { GatewayErrorBody } from "@/lib/types";
import type { GatewayConnection } from "@/lib/server/gateways";

/** A gateway call that failed, with enough detail to surface in the UI. */
export class LumenError extends Error {
  constructor(
    message: string,
    /** HTTP status to relay to the browser. */
    public readonly status: number,
    /** Lumen error code (e.g. LM-1001) when the gateway sent one. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "LumenError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

function extractError(body: GatewayErrorBody | null, fallback: string): {
  message: string;
  code?: string;
} {
  if (body) {
    if (typeof body.error === "string") return { message: body.error };
    if (body.error?.message) {
      return { message: body.error.message, code: body.error.code };
    }
    if (body.message) return { message: body.message };
  }
  return { message: fallback };
}

/**
 * Call a gateway's admin API with its master key. Server-side only: the key
 * is unsealed in `connectGateway` and never serialized to the browser.
 * Non-2xx responses become `LumenError` with the gateway's own message and
 * code relayed verbatim (it never includes secrets).
 */
export async function lumenFetch<T>(
  conn: GatewayConnection,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init ?? {};
  let response: Response;
  try {
    response = await fetch(`${conn.url}${path}`, {
      ...rest,
      headers: {
        Authorization: `Bearer ${conn.masterKey}`,
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...rest.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new LumenError(`gateway unreachable: ${detail}`, 502);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (reverse proxy error page, etc.) — fall through.
  }
  if (!response.ok) {
    const { message, code } = extractError(
      body as GatewayErrorBody | null,
      `gateway answered ${response.status}`,
    );
    throw new LumenError(message, response.status, code);
  }
  return body as T;
}

/** Call an unauthenticated gateway endpoint (/health, /health/providers). */
export async function lumenFetchPublic<T>(
  url: string,
  path: string,
  timeoutMs = 5_000,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new LumenError(`gateway unreachable: ${detail}`, 502);
  }
  if (!response.ok) {
    throw new LumenError(`gateway answered ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}
