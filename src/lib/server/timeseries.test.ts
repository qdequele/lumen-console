import { describe, expect, it } from "vitest";
import { SeriesAccumulator, type RowFilters } from "@/lib/server/timeseries";
import type { UsageRow } from "@/lib/types";

const NO_FILTERS: RowFilters = {
  model: null,
  provider: null,
  capability: null,
  key_id: null,
  group_id: null,
};

function row(overrides: Partial<UsageRow>): UsageRow {
  return {
    id: 1,
    key_id: null,
    group_id: null,
    model: "gpt-5.5",
    model_used: "gpt-5.5",
    provider: "openai",
    capability: "chat",
    tokens_in: 10,
    tokens_out: 5,
    cached_tokens: null,
    reasoning_tokens: null,
    cache_write_tokens: null,
    search_units: null,
    media_count: 0,
    media_bytes: 0,
    estimated: false,
    cost: 0.5,
    latency_ms: 100,
    status: 200,
    metadata: null,
    ts: 0,
    ...overrides,
  };
}

describe("SeriesAccumulator", () => {
  it("buckets rows by their `ts` (the gateway's export field)", () => {
    const accumulator = new SeriesAccumulator(0, 3 * 3600 - 1, 3600);
    accumulator.ingest(
      [row({ id: 1, ts: 10 }), row({ id: 2, ts: 3600 + 5, cost: 0.25 }), row({ id: 3, ts: 7300 })],
      "model",
      NO_FILTERS,
    );
    const [series] = accumulator.build();
    expect(accumulator.timestamps).toEqual([0, 3600, 7200]);
    expect(series.cost).toEqual([0.5, 0.25, 0.5]);
    expect(series.requests).toEqual([1, 1, 1]);
    expect(series.tokens).toEqual([15, 15, 15]);
  });
});
