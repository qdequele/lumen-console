import { describe, expect, it } from "vitest";
import { createSseParser, readSse, type SseFrame } from "@/lib/sse";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<SseFrame[]> {
  const frames: SseFrame[] = [];
  for await (const frame of readSse(body)) frames.push(frame);
  return frames;
}

describe("createSseParser", () => {
  it("parses one JSON data frame per event", () => {
    const parser = createSseParser();
    expect(parser.feed('data: {"a":1}\n\ndata: {"a":2}\n\n')).toEqual([
      { kind: "data", data: { a: 1 } },
      { kind: "data", data: { a: 2 } },
    ]);
  });

  it("reassembles a frame split across chunks, even mid-line", () => {
    const parser = createSseParser();
    expect(parser.feed('data: {"cho')).toEqual([]);
    expect(parser.feed('ices":[]}\n')).toEqual([]);
    expect(parser.feed("\n")).toEqual([{ kind: "data", data: { choices: [] } }]);
  });

  it("handles CRLF line endings", () => {
    const parser = createSseParser();
    expect(parser.feed('data: {"a":1}\r\n\r\n')).toEqual([{ kind: "data", data: { a: 1 } }]);
  });

  it("skips comment and heartbeat lines", () => {
    const parser = createSseParser();
    expect(parser.feed(": keep-alive\n\n:\n\ndata: {\"a\":1}\n\n")).toEqual([
      { kind: "data", data: { a: 1 } },
    ]);
  });

  it("joins multi-line data fields with a newline", () => {
    const parser = createSseParser();
    expect(parser.feed("data: hello\ndata: world\n\n")).toEqual([
      { kind: "data", data: "hello\nworld" },
    ]);
  });

  it("stops at [DONE] and ignores anything after it", () => {
    const parser = createSseParser();
    expect(parser.feed('data: {"a":1}\n\ndata: [DONE]\n\ndata: {"a":2}\n\n')).toEqual([
      { kind: "data", data: { a: 1 } },
      { kind: "done" },
    ]);
    expect(parser.feed('data: {"a":3}\n\n')).toEqual([]);
  });

  it("surfaces an error frame with its code and message", () => {
    const parser = createSseParser();
    expect(
      parser.feed('data: {"error":{"code":"LM-3001","message":"upstream failed"}}\n\n'),
    ).toEqual([{ kind: "error", error: { code: "LM-3001", message: "upstream failed" } }]);
  });

  it("accepts a flat string error", () => {
    const parser = createSseParser();
    expect(parser.feed('data: {"error":"boom"}\n\n')).toEqual([
      { kind: "error", error: { message: "boom" } },
    ]);
  });

  it("flushes a final event that has no trailing blank line", () => {
    const parser = createSseParser();
    expect(parser.feed('data: {"a":1}')).toEqual([]);
    expect(parser.flush()).toEqual([{ kind: "data", data: { a: 1 } }]);
  });
});

describe("readSse", () => {
  it("yields frames from a byte stream split at arbitrary points", async () => {
    const frames = await collect(
      streamOf('data: {"n":', "1}\n\n: ping\n\nda", 'ta: {"n":2}\n\ndata: [DO', "NE]\n\n"),
    );
    expect(frames).toEqual([
      { kind: "data", data: { n: 1 } },
      { kind: "data", data: { n: 2 } },
      { kind: "done" },
    ]);
  });

  it("decodes a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode('data: {"t":"é"}\n\n');
    const splitAt = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, splitAt));
        controller.enqueue(bytes.slice(splitAt));
        controller.close();
      },
    });
    expect(await collect(body)).toEqual([{ kind: "data", data: { t: "é" } }]);
  });
});
