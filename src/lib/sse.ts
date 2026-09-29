/**
 * Minimal Server-Sent Events reader for OpenAI-style streams: `data:` lines
 * carry JSON, `data: [DONE]` ends the stream, and a `data: {"error": ...}`
 * frame reports a failure after the response headers were already sent.
 */

export interface SseError {
  code?: string;
  message: string;
}

export type SseFrame =
  | { kind: "data"; data: unknown }
  | { kind: "done" }
  | { kind: "error"; error: SseError };

export interface SseParser {
  /** Feed decoded text; returns the frames completed by it. */
  feed(text: string): SseFrame[];
  /** End of input: returns a final frame left without a trailing blank line. */
  flush(): SseFrame[];
}

function toFrame(payload: string): SseFrame {
  if (payload === "[DONE]") return { kind: "done" };
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return { kind: "data", data: payload };
  }
  if (data !== null && typeof data === "object" && "error" in data) {
    const error = (data as { error: unknown }).error;
    if (typeof error === "string") return { kind: "error", error: { message: error } };
    if (error !== null && typeof error === "object") {
      const { code, message } = error as { code?: unknown; message?: unknown };
      return {
        kind: "error",
        error: {
          ...(typeof code === "string" ? { code } : {}),
          message: typeof message === "string" ? message : "stream error",
        },
      };
    }
  }
  return { kind: "data", data };
}

export function createSseParser(): SseParser {
  let buffer = "";
  let dataLines: string[] = [];
  let done = false;

  function dispatch(frames: SseFrame[]) {
    if (dataLines.length === 0) return;
    const frame = toFrame(dataLines.join("\n"));
    dataLines = [];
    frames.push(frame);
    if (frame.kind === "done") done = true;
  }

  function processLine(line: string, frames: SseFrame[]) {
    if (line === "") {
      dispatch(frames);
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") dataLines.push(value);
  }

  return {
    feed(text) {
      const frames: SseFrame[] = [];
      if (done) return frames;
      buffer += text;
      let newline: number;
      while (!done && (newline = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        processLine(line, frames);
      }
      if (done) buffer = "";
      return frames;
    },
    flush() {
      const frames: SseFrame[] = [];
      if (done) return frames;
      if (buffer !== "") {
        processLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer, frames);
        buffer = "";
      }
      dispatch(frames);
      return frames;
    },
  };
}

/** Yield frames from a response body until `[DONE]` or the end of the stream. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    while (true) {
      const { value, done } = await reader.read();
      const frames = done
        ? [...parser.feed(decoder.decode()), ...parser.flush()]
        : parser.feed(decoder.decode(value, { stream: true }));
      for (const frame of frames) {
        yield frame;
        if (frame.kind === "done") return;
      }
      if (done) return;
    }
  } finally {
    // Stops the download if the consumer bails out early (Stop, [DONE]).
    await reader.cancel().catch(() => undefined);
  }
}
