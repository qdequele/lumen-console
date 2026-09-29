import { describe, expect, it } from "vitest";
import {
  curlCommand,
  isFallback,
  resultError,
  tokenSummary,
  type PlaygroundResult,
} from "./result";

const base: PlaygroundResult = {
  endpoint: "chat/completions",
  request: {},
  status: 200,
  body: {},
  modelUsed: null,
  latencyMs: 10,
};

describe("resultError", () => {
  it("is null for a success", () => {
    expect(resultError(base)).toBeNull();
  });

  it("reads the gateway envelope", () => {
    expect(
      resultError({
        ...base,
        status: 402,
        body: { error: { code: "LM-4001", message: "budget exceeded for this key" } },
      }),
    ).toEqual({ message: "budget exceeded for this key", code: "LM-4001", console: false });
  });

  it("flags a console-side failure", () => {
    expect(
      resultError({
        ...base,
        status: 502,
        body: { error: "gateway unreachable: fetch failed", source: "console" },
      }),
    ).toEqual({ message: "gateway unreachable: fetch failed", code: undefined, console: true });
  });

  it("falls back to the status for a non-JSON error body", () => {
    expect(resultError({ ...base, status: 503, body: "<html>" })).toEqual({
      message: "HTTP 503",
      console: false,
    });
  });

  it("reports a mid-stream error on an otherwise 200 response", () => {
    expect(
      resultError({ ...base, streamError: { code: "LM-3010", message: "cut" } }),
    ).toEqual({ message: "cut", code: "LM-3010", console: false });
  });
});

describe("tokenSummary", () => {
  it("reads chat usage", () => {
    expect(
      tokenSummary({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
    ).toEqual({ input: 10, output: 5, total: 15, searchUnits: undefined, estimated: false });
  });

  it("reads systemone usage and its estimated flag", () => {
    expect(
      tokenSummary({ usage: { input_tokens: 46, output_tokens: 0, estimated: true } }),
    ).toEqual({ input: 46, output: 0, total: 46, searchUnits: undefined, estimated: true });
  });

  it("reads rerank usage with tokens_estimated", () => {
    expect(
      tokenSummary({ usage: { search_units: 1, total_tokens: 42, tokens_estimated: true } }),
    ).toMatchObject({ total: 42, searchUnits: 1, estimated: true });
  });

  it("is null without usage", () => {
    expect(tokenSummary({ data: [] })).toBeNull();
    expect(tokenSummary("text")).toBeNull();
  });
});

describe("isFallback", () => {
  it("is true only when the served model differs from the requested one", () => {
    expect(isFallback({ ...base, requestedModel: "a", modelUsed: "b" })).toBe(true);
    expect(isFallback({ ...base, requestedModel: "a", modelUsed: "a" })).toBe(false);
    expect(isFallback({ ...base, requestedModel: "a", modelUsed: null })).toBe(false);
  });
});

describe("curlCommand", () => {
  it("targets the gateway with the key as a variable and quotes the body for a shell", () => {
    const command = curlCommand("https://gw.example.com/", "chat/completions", {
      model: "gpt-4o",
      stream: true,
      messages: [{ role: "user", content: "it's" }],
    });
    expect(command.split(" \\\n")[0]).toBe("curl -N https://gw.example.com/v1/chat/completions");
    expect(command).toContain('-H "Authorization: Bearer $LUMEN_API_KEY"');
    expect(command).toContain(`it'\\''s`);
    expect(command).not.toMatch(/fg-/);
  });

  it("sends no body for GET models", () => {
    expect(curlCommand("https://gw", "models", null)).toBe(
      'curl https://gw/v1/models \\\n  -H "Authorization: Bearer $LUMEN_API_KEY"',
    );
  });
});
