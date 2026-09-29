import { describe, expect, it, vi } from "vitest";
import type { GatewayConnection } from "@/lib/server/gateways";

vi.mock("@/lib/server/lumen", () => ({
  LumenError: class extends Error {},
  lumenFetch: async () => ({
    hash: "h",
    config: `
[[providers]]
name = "openai"
kind = "openai"

[[providers.models]]
id = "quoted"
capabilities = ["chat"]
release_date = "2024-08-06"

[[providers.models]]
id = "bare"
capabilities = ["chat"]
release_date = 2026-08-07

[[providers.models]]
id = "undated"
capabilities = ["chat"]
`,
  }),
}));

const { fetchConfig } = await import("@/lib/server/config");

describe("fetchConfig release dates", () => {
  it("reads quoted and bare TOML dates as YYYY-MM-DD strings", async () => {
    const { providers } = await fetchConfig({} as GatewayConnection);
    expect(providers[0].models.map((model) => model.release_date)).toEqual([
      "2024-08-06",
      "2026-08-07",
      undefined,
    ]);
  });
});
