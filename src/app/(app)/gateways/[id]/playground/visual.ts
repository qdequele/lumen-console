/** Pure helpers behind the inspector's visual views. */

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The folded label of a JSON container: "3 items", "2 keys". */
export function summarize(value: unknown[] | Record<string, unknown>): string {
  return Array.isArray(value) ? plural(value.length, "item") : plural(Object.keys(value).length, "key");
}

const MAX_OPEN_CHILDREN = 50;
const MAX_OPEN_NUMBERS = 16;
const OPEN_DEPTH = 2;

/** Whether a JSON container starts expanded in the tree viewer. */
export function initiallyOpen(value: unknown[] | Record<string, unknown>, depth: number): boolean {
  if (depth >= OPEN_DEPTH) return false;
  const children = Array.isArray(value) ? value : Object.values(value);
  if (children.length > MAX_OPEN_CHILDREN) return false;
  // Embedding vectors: hundreds of floats that bury everything else.
  if (children.length > MAX_OPEN_NUMBERS && children.every((child) => typeof child === "number")) {
    return false;
  }
  return true;
}

export interface StreamTiming {
  ttftMs: number;
  generationMs: number;
  /** Fraction of the total latency spent before the first token. */
  ttftShare: number;
  /** Output tokens over generation time; absent when either is unknown or zero. */
  tokensPerSecond?: number;
}

/** Timing breakdown of a streamed call, or null for a non-streamed one. */
export function streamTiming(
  result: { latencyMs: number; ttftMs?: number },
  outputTokens: number | undefined,
): StreamTiming | null {
  if (result.ttftMs === undefined || result.latencyMs <= 0) return null;
  const ttftMs = Math.min(result.ttftMs, result.latencyMs);
  const generationMs = result.latencyMs - ttftMs;
  return {
    ttftMs,
    generationMs,
    ttftShare: ttftMs / result.latencyMs,
    ...(outputTokens && generationMs > 0
      ? { tokensPerSecond: outputTokens / (generationMs / 1000) }
      : {}),
  };
}

/** Input/output shares of a stacked token bar, or null with nothing to draw. */
export function tokenSplit(
  input: number | undefined,
  output: number | undefined,
): { inShare: number; outShare: number } | null {
  const total = (input ?? 0) + (output ?? 0);
  if (total <= 0) return null;
  return { inShare: (input ?? 0) / total, outShare: (output ?? 0) / total };
}
