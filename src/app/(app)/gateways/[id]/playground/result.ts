import type { SseError } from "@/lib/sse";

/** The five /v1 endpoints the Playground reaches through the console proxy. */
export type PlaygroundEndpoint = "chat/completions" | "embeddings" | "rerank" | "systemone" | "models";

/** Everything the inspector shows about one call. */
export interface PlaygroundResult {
  endpoint: PlaygroundEndpoint;
  /** JSON body sent, or null for GET. */
  request: unknown;
  /** HTTP status the browser received; null when the console itself was unreachable. */
  status: number | null;
  /** Parsed JSON body (or raw text); for streams, the assembled message. */
  body: unknown;
  requestedModel?: string;
  /** From `x-lumen-model-used`. */
  modelUsed: string | null;
  latencyMs: number;
  /** Streams only: browser-measured time to the first content token. */
  ttftMs?: number;
  /** Streams only: number of data frames received. */
  chunks?: number;
  /** A `data: {"error": ...}` frame received after the stream started. */
  streamError?: SseError;
  /** The user pressed Stop. */
  aborted?: boolean;
  /** Browser-side failure (network down, console unreachable). */
  clientError?: string;
}

export interface ResultError {
  message: string;
  code?: string;
  /** The failure happened in the console, not on the gateway. */
  console: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The error a response carries: the gateway's `{"error": {code, message}}`
 * envelope, or the console's own `{"error": "...", "code"?, "source": "console"}`.
 */
export function resultError(result: PlaygroundResult): ResultError | null {
  if (result.clientError) return { message: result.clientError, console: true };
  if (result.streamError) {
    return { message: result.streamError.message, code: result.streamError.code, console: false };
  }
  if (result.status !== null && result.status < 400) return null;
  const body = result.body;
  if (isRecord(body)) {
    const error = body.error;
    const console = body.source === "console";
    if (isRecord(error)) {
      return {
        message: typeof error.message === "string" ? error.message : `HTTP ${result.status}`,
        code: typeof error.code === "string" ? error.code : undefined,
        console,
      };
    }
    if (typeof error === "string") {
      return { message: error, code: typeof body.code === "string" ? body.code : undefined, console };
    }
  }
  return { message: `HTTP ${result.status}`, console: false };
}

export interface TokenSummary {
  input?: number;
  output?: number;
  total?: number;
  searchUnits?: number;
  estimated: boolean;
}

const num = (value: unknown) => (typeof value === "number" ? value : undefined);

/** Token counts from the response `usage`, whichever endpoint shaped it. */
export function tokenSummary(body: unknown): TokenSummary | null {
  if (!isRecord(body) || !isRecord(body.usage)) return null;
  const usage = body.usage;
  const input = num(usage.prompt_tokens) ?? num(usage.input_tokens);
  const output = num(usage.completion_tokens) ?? num(usage.output_tokens);
  const total = num(usage.total_tokens) ?? (input !== undefined ? input + (output ?? 0) : undefined);
  return {
    input,
    output,
    total,
    searchUnits: num(usage.search_units),
    estimated: usage.estimated === true || usage.tokens_estimated === true,
  };
}

/** The model actually served differs from the one asked for. */
export function isFallback(result: PlaygroundResult): boolean {
  return (
    result.requestedModel !== undefined &&
    result.modelUsed !== null &&
    result.modelUsed !== result.requestedModel
  );
}

const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/** An equivalent curl call against the gateway itself, key left as a variable. */
export function curlCommand(gatewayUrl: string, endpoint: PlaygroundEndpoint, request: unknown): string {
  const url = `${gatewayUrl.replace(/\/+$/, "")}/v1/${endpoint}`;
  const streaming = isRecord(request) && request.stream === true;
  const lines = [
    `curl${streaming ? " -N" : ""} ${url}`,
    `  -H "Authorization: Bearer $LUMEN_API_KEY"`,
  ];
  if (request !== null && request !== undefined) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d ${shellQuote(JSON.stringify(request, null, 2))}`);
  }
  return lines.join(" \\\n");
}
