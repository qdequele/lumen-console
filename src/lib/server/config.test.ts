import { describe, expect, it } from "vitest";
import { validateModel } from "@/lib/server/config";

describe("validateModel capabilities", () => {
  it.each(["chat", "embed", "rerank", "systemone"])("accepts %s", (capability) => {
    expect(validateModel({ id: "m", capabilities: [capability] }, new Set(["m"]))).toBeNull();
  });

  it("rejects an unknown capability and lists every valid one", () => {
    expect(validateModel({ id: "m", capabilities: ["vision"] }, new Set(["m"]))).toBe(
      'invalid capability "vision": expected chat, embed, rerank or systemone',
    );
  });
});
