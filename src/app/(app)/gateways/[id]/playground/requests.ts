import { z } from "zod";
import type { ChatState, ChatTurn, EmbeddingsState, RerankState, SystemOneState } from "./store";

/** A request body ready to send, or per-field messages to show inline. */
export type Built<T> = { request: T } | { errors: Record<string, string> };

export interface ChatRequest {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
}

const temperature = z.coerce.number().min(0).max(2);
const positiveInt = z.coerce.number().int().positive();

/** Parse an optional numeric field: blank means "leave it to the gateway". */
function optional<T>(
  schema: z.ZodType<T>,
  raw: string,
  field: string,
  message: string,
  errors: Record<string, string>,
): T | undefined {
  if (raw.trim() === "") return undefined;
  const parsed = schema.safeParse(raw.trim());
  if (!parsed.success) {
    errors[field] = message;
    return undefined;
  }
  return parsed.data;
}

const lines = (text: string) => text.split("\n").filter((line) => line.trim() !== "");

function finish<T>(request: T, errors: Record<string, string>): Built<T> {
  return Object.keys(errors).length > 0 ? { errors } : { request };
}

export function buildChatRequest(
  chat: Pick<ChatState, "model" | "system" | "stream" | "temperature" | "maxTokens">,
  turns: ChatTurn[],
): Built<ChatRequest> {
  const errors: Record<string, string> = {};
  if (!chat.model) errors.model = "Pick a model";
  const temp = optional(temperature, chat.temperature, "temperature", "Must be a number between 0 and 2", errors);
  const maxTokens = optional(positiveInt, chat.maxTokens, "maxTokens", "Must be a positive whole number", errors);
  return finish(
    {
      model: chat.model,
      messages: [
        ...(chat.system.trim() ? [{ role: "system" as const, content: chat.system }] : []),
        ...turns,
      ],
      stream: chat.stream,
      ...(temp !== undefined ? { temperature: temp } : {}),
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    },
    errors,
  );
}

export function buildEmbeddingsRequest(
  state: Pick<EmbeddingsState, "model" | "input">,
): Built<{ model: string; input: string[] }> {
  const errors: Record<string, string> = {};
  if (!state.model) errors.model = "Pick a model";
  const input = lines(state.input);
  if (input.length === 0) errors.input = "Enter at least one line";
  return finish({ model: state.model, input }, errors);
}

export function buildRerankRequest(
  state: Pick<RerankState, "model" | "query" | "documents" | "topN">,
): Built<{ model: string; query: string; documents: string[]; top_n?: number }> {
  const errors: Record<string, string> = {};
  if (!state.model) errors.model = "Pick a model";
  if (!state.query.trim()) errors.query = "Enter a query";
  const documents = lines(state.documents);
  if (documents.length === 0) errors.documents = "Enter at least one document";
  const topN = optional(positiveInt, state.topN, "topN", "Must be a positive whole number", errors);
  return finish(
    { model: state.model, query: state.query, documents, ...(topN !== undefined ? { top_n: topN } : {}) },
    errors,
  );
}

function parseJson(text: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const questionsSchema = z.record(z.string(), z.unknown());

export function buildSystemOneRequest(
  state: Pick<SystemOneState, "model" | "state" | "stateAsJson" | "questions">,
): Built<{ model: string; state: unknown; questions: Record<string, unknown> }> {
  const errors: Record<string, string> = {};
  if (!state.model) errors.model = "Pick a model";

  let stateValue: unknown = state.state;
  if (state.stateAsJson) {
    const parsed = parseJson(state.state);
    if ("error" in parsed) errors.state = parsed.error;
    else if (parsed.value === null) errors.state = "State must not be null";
    else stateValue = parsed.value;
  } else if (!state.state.trim()) {
    errors.state = "Enter a state";
  }

  let questions: Record<string, unknown> = {};
  const parsedQuestions = parseJson(state.questions);
  if ("error" in parsedQuestions) {
    errors.questions = parsedQuestions.error;
  } else {
    const checked = questionsSchema.safeParse(parsedQuestions.value);
    if (!checked.success || Array.isArray(parsedQuestions.value)) {
      errors.questions = "Must be a JSON object of question id → question";
    } else {
      questions = checked.data;
    }
  }
  return finish({ model: state.model, state: stateValue, questions }, errors);
}
