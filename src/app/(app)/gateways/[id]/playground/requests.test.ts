import { describe, expect, it } from "vitest";
import {
  buildChatRequest,
  buildEmbeddingsRequest,
  buildRerankRequest,
  buildSystemOneRequest,
} from "./requests";

describe("buildChatRequest", () => {
  const chat = { model: "gpt-4o", system: "", stream: true, temperature: "", maxTokens: "" };

  it("sends the whole conversation, with the system prompt first when set", () => {
    expect(
      buildChatRequest({ ...chat, system: "Be brief." }, [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "again" },
      ]),
    ).toEqual({
      request: {
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Be brief." },
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
          { role: "user", content: "again" },
        ],
        stream: true,
      },
    });
  });

  it("omits a blank system prompt and blank sampling fields", () => {
    const built = buildChatRequest({ ...chat, system: "  " }, [{ role: "user", content: "hi" }]);
    expect(built).toEqual({
      request: { model: "gpt-4o", messages: [{ role: "user", content: "hi" }], stream: true },
    });
  });

  it("sends temperature and max_tokens as numbers", () => {
    const built = buildChatRequest(
      { ...chat, stream: false, temperature: "0.2", maxTokens: "256" },
      [{ role: "user", content: "hi" }],
    );
    expect(built).toMatchObject({ request: { stream: false, temperature: 0.2, max_tokens: 256 } });
  });

  it("rejects invalid numbers and a missing model", () => {
    expect(
      buildChatRequest({ ...chat, model: "", temperature: "hot", maxTokens: "-1" }, [
        { role: "user", content: "hi" },
      ]),
    ).toEqual({
      errors: {
        model: "Pick a model",
        temperature: "Must be a number between 0 and 2",
        maxTokens: "Must be a positive whole number",
      },
    });
  });
});

describe("buildEmbeddingsRequest", () => {
  it("sends one input per non-blank line", () => {
    expect(buildEmbeddingsRequest({ model: "emb", input: "a\n\n  b  \n" })).toEqual({
      request: { model: "emb", input: ["a", "  b  "] },
    });
  });

  it("requires at least one line", () => {
    expect(buildEmbeddingsRequest({ model: "emb", input: " \n " })).toEqual({
      errors: { input: "Enter at least one line" },
    });
  });
});

describe("buildRerankRequest", () => {
  it("sends documents one per line and top_n when set", () => {
    expect(
      buildRerankRequest({ model: "rr", query: "q", documents: "a\nb\n", topN: "1" }),
    ).toEqual({ request: { model: "rr", query: "q", documents: ["a", "b"], top_n: 1 } });
  });

  it("requires a query and documents", () => {
    expect(buildRerankRequest({ model: "rr", query: " ", documents: "", topN: "0" })).toEqual({
      errors: {
        query: "Enter a query",
        documents: "Enter at least one document",
        topN: "Must be a positive whole number",
      },
    });
  });
});

describe("buildSystemOneRequest", () => {
  const questions = '{"u":{"type":"noul","instructions":"x"}}';

  it("sends state as a string when the JSON switch is off", () => {
    expect(
      buildSystemOneRequest({ model: "jev", state: '{"a":1}', stateAsJson: false, questions }),
    ).toEqual({
      request: {
        model: "jev",
        state: '{"a":1}',
        questions: { u: { type: "noul", instructions: "x" } },
      },
    });
  });

  it("parses state as JSON when the switch is on", () => {
    expect(
      buildSystemOneRequest({ model: "jev", state: '{"a":1}', stateAsJson: true, questions }),
    ).toMatchObject({ request: { state: { a: 1 } } });
  });

  it("reports parse errors inline instead of sending", () => {
    const built = buildSystemOneRequest({
      model: "jev",
      state: "{nope",
      stateAsJson: true,
      questions: "[1,2]",
    });
    expect("errors" in built && built.errors.state).toMatch(/^Invalid JSON/);
    expect("errors" in built && built.errors.questions).toBe(
      "Must be a JSON object of question id → question",
    );
  });

  it("rejects a JSON null state, which the gateway refuses", () => {
    const built = buildSystemOneRequest({ model: "jev", state: "null", stateAsJson: true, questions });
    expect(built).toEqual({ errors: { state: "State must not be null" } });
  });
});
