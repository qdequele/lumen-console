"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readSse, type SseError } from "@/lib/sse";
import type { ChatRequest } from "./requests";
import type { PlaygroundEndpoint, PlaygroundResult } from "./result";
import { usePlaygroundStore, type GatewayPlayground } from "./store";

const proxyUrl = (gatewayId: string, endpoint: PlaygroundEndpoint) =>
  `/api/gateways/${gatewayId}/v1/${endpoint}`;

const requestedModel = (request: unknown) =>
  request !== null && typeof request === "object" && "model" in request
    ? String((request as { model: unknown }).model)
    : undefined;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/** One non-streaming call through the console proxy. */
export async function callPlayground(
  gatewayId: string,
  endpoint: PlaygroundEndpoint,
  request: unknown,
  signal?: AbortSignal,
): Promise<PlaygroundResult> {
  const started = performance.now();
  const base = { endpoint, request, requestedModel: requestedModel(request) };
  try {
    const init: RequestInit =
      endpoint === "models"
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          };
    const response = await fetch(proxyUrl(gatewayId, endpoint), signal ? { ...init, signal } : init);
    const body = await readBody(response);
    return {
      ...base,
      status: response.status,
      body,
      modelUsed: response.headers.get("x-lumen-model-used"),
      latencyMs: performance.now() - started,
    };
  } catch (error) {
    return {
      ...base,
      status: null,
      body: null,
      modelUsed: null,
      latencyMs: performance.now() - started,
      ...(isAbort(error) ? { aborted: true } : { clientError: errorText(error) }),
    };
  }
}

interface ChunkChoice {
  delta?: { content?: string | null };
  finish_reason?: string | null;
}

interface Chunk {
  choices?: ChunkChoice[];
  usage?: unknown;
}

/** A streaming chat call: deltas are reported as they arrive. */
export async function streamChat(
  gatewayId: string,
  request: ChatRequest,
  options: { signal: AbortSignal; onDelta: (text: string) => void },
): Promise<PlaygroundResult> {
  const started = performance.now();
  const base = {
    endpoint: "chat/completions" as const,
    request,
    requestedModel: request.model,
  };
  let response: Response;
  try {
    response = await fetch(proxyUrl(gatewayId, "chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: options.signal,
    });
  } catch (error) {
    return {
      ...base,
      status: null,
      body: null,
      modelUsed: null,
      latencyMs: performance.now() - started,
      ...(isAbort(error) ? { aborted: true } : { clientError: errorText(error) }),
    };
  }
  const modelUsed = response.headers.get("x-lumen-model-used");
  if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    // Errors before the first frame come back as ordinary JSON responses.
    return {
      ...base,
      status: response.status,
      body: await readBody(response).catch(() => null),
      modelUsed,
      latencyMs: performance.now() - started,
    };
  }

  let content = "";
  let chunks = 0;
  let finishReason: string | null = null;
  let usage: unknown;
  let ttftMs: number | undefined;
  let streamError: SseError | undefined;
  let aborted = false;
  let clientError: string | undefined;
  try {
    for await (const frame of readSse(response.body!)) {
      if (frame.kind === "error") {
        streamError = frame.error;
        break;
      }
      if (frame.kind !== "data") continue;
      chunks += 1;
      const data = frame.data as Chunk;
      const choice = data.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) {
        ttftMs ??= performance.now() - started;
        content += delta;
        options.onDelta(delta);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (data.usage) usage = data.usage;
    }
  } catch (error) {
    if (isAbort(error) || options.signal.aborted) aborted = true;
    else clientError = errorText(error);
  }
  return {
    ...base,
    status: response.status,
    body: {
      message: { role: "assistant", content },
      finish_reason: finishReason,
      ...(usage !== undefined ? { usage } : {}),
    },
    modelUsed,
    latencyMs: performance.now() - started,
    chunks,
    ...(ttftMs !== undefined ? { ttftMs } : {}),
    ...(streamError ? { streamError } : {}),
    ...(aborted ? { aborted } : {}),
    ...(clientError ? { clientError } : {}),
  };
}

/** Refresh the Usage tab after a call spent tokens. */
export function useInvalidateUsage(gatewayId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["usage", gatewayId] });
    void client.invalidateQueries({ queryKey: ["usage-timeseries", gatewayId] });
  };
}

/** Non-streaming calls go through a TanStack mutation. */
export function usePlaygroundCall(gatewayId: string, endpoint: PlaygroundEndpoint) {
  const invalidateUsage = useInvalidateUsage(gatewayId);
  return useMutation({
    mutationFn: ({ request, signal }: { request: unknown; signal?: AbortSignal }) =>
      callPlayground(gatewayId, endpoint, request, signal),
    onSettled: invalidateUsage,
  });
}

/**
 * Run one non-streaming call for a sub-tab: marks it running, stores the
 * result in the playground store, refreshes usage.
 */
export function useRunner<K extends "embeddings" | "rerank" | "systemone" | "models">(
  gatewayId: string,
  key: K,
  endpoint: PlaygroundEndpoint,
) {
  const call = usePlaygroundCall(gatewayId, endpoint);
  const patch = usePlaygroundStore((store) => store.patch);
  return async (request: unknown) => {
    patch(gatewayId, key, { running: true } as Partial<GatewayPlayground[K]>);
    const result = await call.mutateAsync({ request });
    patch(gatewayId, key, { running: false, result } as Partial<GatewayPlayground[K]>);
  };
}
