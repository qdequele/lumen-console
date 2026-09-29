import { describe, expect, it } from "vitest";
import { initiallyOpen, streamTiming, summarize, tokenSplit } from "./visual";

describe("summarize", () => {
  it("counts array items and object keys", () => {
    expect(summarize([1, 2, 3])).toBe("3 items");
    expect(summarize([1])).toBe("1 item");
    expect(summarize({ a: 1, b: 2 })).toBe("2 keys");
    expect(summarize({})).toBe("0 keys");
  });
});

describe("initiallyOpen", () => {
  it("opens the first two levels", () => {
    expect(initiallyOpen({ a: 1 }, 0)).toBe(true);
    expect(initiallyOpen({ a: 1 }, 1)).toBe(true);
    expect(initiallyOpen({ a: 1 }, 2)).toBe(false);
  });

  it("folds long arrays of numbers, such as embedding vectors", () => {
    expect(initiallyOpen(Array.from({ length: 1536 }, () => 0.1), 1)).toBe(false);
    expect(initiallyOpen([0.1, 0.2, 0.3], 1)).toBe(true);
  });

  it("folds any container with more than 50 children", () => {
    expect(initiallyOpen(Array.from({ length: 51 }, (_, index) => ({ index })), 0)).toBe(false);
  });
});

describe("streamTiming", () => {
  it("splits time to first token from generation and computes tokens per second", () => {
    expect(streamTiming({ latencyMs: 4910, ttftMs: 460 }, 35)).toEqual({
      ttftMs: 460,
      generationMs: 4450,
      ttftShare: 460 / 4910,
      tokensPerSecond: 35 / 4.45,
    });
  });

  it("has no rate without output tokens or generation time", () => {
    expect(streamTiming({ latencyMs: 500, ttftMs: 500 }, 10)?.tokensPerSecond).toBeUndefined();
    expect(streamTiming({ latencyMs: 900, ttftMs: 100 }, undefined)?.tokensPerSecond).toBeUndefined();
  });

  it("is null for non-streamed calls", () => {
    expect(streamTiming({ latencyMs: 900 }, 10)).toBeNull();
  });
});

describe("tokenSplit", () => {
  it("gives each side its share of the total", () => {
    expect(tokenSplit(14, 35)).toEqual({ inShare: 14 / 49, outShare: 35 / 49 });
  });

  it("treats a missing side as zero and is null with no tokens", () => {
    expect(tokenSplit(46, undefined)).toEqual({ inShare: 1, outShare: 0 });
    expect(tokenSplit(0, 0)).toBeNull();
    expect(tokenSplit(undefined, undefined)).toBeNull();
  });
});
