import { describe, expect, it } from "vitest";
import { mergeModel, modelFromBody, toRawModel, validateModel } from "@/lib/server/config";

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

describe("release dates", () => {
  it("accepts a real date and no date", () => {
    const ids = new Set(["m"]);
    expect(validateModel({ id: "m", capabilities: ["chat"], release_date: "2024-08-06" }, ids)).toBeNull();
    expect(validateModel({ id: "m", capabilities: ["chat"] }, ids)).toBeNull();
  });

  it("rejects an impossible date", () => {
    expect(
      validateModel({ id: "m", capabilities: ["chat"], release_date: "2024-02-30" }, new Set(["m"])),
    ).toBe('invalid release date "2024-02-30": expected a real date YYYY-MM-DD from 1970-01-01');
  });

  it("writes the date back so console edits keep it", () => {
    expect(toRawModel({ id: "m", capabilities: ["chat"], release_date: "2024-08-06" })).toEqual({
      id: "m",
      capabilities: ["chat"],
      release_date: "2024-08-06",
    });
    expect(toRawModel({ id: "m", capabilities: ["chat"], release_date: "" })).not.toHaveProperty(
      "release_date",
    );
  });
});

describe("mergeModel", () => {
  const current = {
    id: "gpt-4o",
    upstream_id: "gpt-4o-2024-08-06",
    capabilities: ["chat"],
    modalities: ["text", "image"],
    cost_per_1m_input: 2.5,
    cost_per_1m_output: 10,
    fallbacks: ["claude-sonnet-5"],
    release_date: "2024-08-06",
  };

  it("keeps every value when the body omits it", () => {
    expect(mergeModel(current, {})).toEqual(current);
  });

  it("clears each optional field with its clear marker", () => {
    expect(
      mergeModel(current, {
        upstream_id: "",
        modalities: [],
        cost_per_1m_input: null,
        cost_per_1m_output: null,
        fallbacks: [],
        release_date: "",
      }),
    ).toEqual({ id: "gpt-4o", capabilities: ["chat"] });
  });

  it("replaces provided values, including a zero price", () => {
    expect(mergeModel(current, { upstream_id: " gpt-4o-2024-11-20 ", cost_per_1m_input: 0 }))
      .toMatchObject({ upstream_id: "gpt-4o-2024-11-20", cost_per_1m_input: 0 });
  });

  it("writes a cleared model without the cleared keys", () => {
    expect(toRawModel(mergeModel(current, { upstream_id: "", cost_per_1m_input: null }))).toEqual({
      id: "gpt-4o",
      capabilities: ["chat"],
      modalities: ["text", "image"],
      cost_per_1m_output: 10,
      fallbacks: ["claude-sonnet-5"],
      release_date: "2024-08-06",
    });
  });
});

describe("modelFromBody", () => {
  it("treats clear markers as absent on a new model", () => {
    expect(
      modelFromBody({
        id: " m ",
        upstream_id: "",
        capabilities: ["chat"],
        modalities: [],
        cost_per_1m_input: null,
        cost_per_1m_output: null,
        fallbacks: [],
        release_date: "",
      }),
    ).toEqual({ id: "m", capabilities: ["chat"] });
  });
});
