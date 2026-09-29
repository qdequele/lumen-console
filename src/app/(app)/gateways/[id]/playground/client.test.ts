import { afterEach, describe, expect, it, vi } from "vitest";
import { callPlayground, streamChat } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(frames: string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream", ...headers } },
  );
}

const chunk = (delta: object, extra: object = {}) =>
  `data: ${JSON.stringify({ object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`;

const request = { model: "gpt-4o", messages: [{ role: "user" as const, content: "hi" }], stream: true };

describe("callPlayground", () => {
  it("posts JSON to the console proxy and captures status, body and model used", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [] }, { status: 200, headers: { "x-lumen-model-used": "emb-2" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callPlayground("gw-1", "embeddings", { model: "emb", input: ["a"] });

    expect(fetchMock).toHaveBeenCalledWith("/api/gateways/gw-1/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"model":"emb","input":["a"]}',
    });
    expect(result).toMatchObject({
      endpoint: "embeddings",
      status: 200,
      body: { data: [] },
      requestedModel: "emb",
      modelUsed: "emb-2",
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("uses GET without a body for models", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await callPlayground("gw-1", "models", null);
    expect(fetchMock).toHaveBeenCalledWith("/api/gateways/gw-1/v1/models", { method: "GET" });
  });

  it("keeps a non-JSON body as text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })));
    const result = await callPlayground("gw-1", "rerank", { model: "rr" });
    expect(result).toMatchObject({ status: 502, body: "<html>bad gateway</html>" });
  });

  it("reports a browser-side network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const result = await callPlayground("gw-1", "rerank", { model: "rr" });
    expect(result).toMatchObject({ status: null, clientError: "Failed to fetch" });
  });
});

describe("streamChat", () => {
  it("assembles deltas, counts chunks, and keeps the final usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse(
          [
            chunk({ role: "assistant", content: "" }),
            chunk({ content: "Hel" }),
            ": ping\n\n",
            chunk({ content: "lo" }),
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\n`,
            "data: [DONE]\n\n",
          ],
          { "x-lumen-model-used": "claude-sonnet-5" },
        ),
      ),
    );
    const deltas: string[] = [];

    const result = await streamChat("gw-1", request, {
      signal: new AbortController().signal,
      onDelta: (text) => deltas.push(text),
    });

    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result).toMatchObject({
      status: 200,
      chunks: 4,
      modelUsed: "claude-sonnet-5",
      requestedModel: "gpt-4o",
      body: {
        message: { role: "assistant", content: "Hello" },
        finish_reason: "stop",
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      },
    });
    expect(result.ttftMs).toBeGreaterThanOrEqual(0);
    expect(result.streamError).toBeUndefined();
  });

  it("keeps the partial reply and surfaces a mid-stream error frame", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          chunk({ content: "Par" }),
          'data: {"error":{"code":"LM-3010","message":"upstream ended"}}\n\n',
        ]),
      ),
    );
    const result = await streamChat("gw-1", request, {
      signal: new AbortController().signal,
      onDelta: () => undefined,
    });
    expect(result.body).toMatchObject({ message: { content: "Par" } });
    expect(result.streamError).toEqual({ code: "LM-3010", message: "upstream ended" });
  });

  it("returns the JSON error when the gateway refuses before streaming", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: { code: "LM-4001", message: "budget exceeded" } }, { status: 402 }),
      ),
    );
    const result = await streamChat("gw-1", request, {
      signal: new AbortController().signal,
      onDelta: () => undefined,
    });
    expect(result).toMatchObject({
      status: 402,
      body: { error: { code: "LM-4001" } },
    });
    expect(result.chunks).toBeUndefined();
  });

  it("marks the result aborted and keeps what arrived when the user stops", async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(encoder.encode(chunk({ content: "Half" })));
            init.signal?.addEventListener("abort", () =>
              stream.error(new DOMException("The operation was aborted.", "AbortError")),
            );
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
      }),
    );

    const result = await streamChat("gw-1", request, {
      signal: controller.signal,
      onDelta: () => controller.abort(),
    });

    expect(result.aborted).toBe(true);
    expect(result.body).toMatchObject({ message: { content: "Half" } });
    expect(result.clientError).toBeUndefined();
  });
});
