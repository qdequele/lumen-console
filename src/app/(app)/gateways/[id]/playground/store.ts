"use client";

import { create } from "zustand";
import type { PlaygroundResult } from "./result";

/**
 * Playground inputs and last results, per gateway, in memory only: switching
 * sub-tabs keeps a conversation, a reload drops it.
 */

export type PlaygroundTab = "chat" | "embeddings" | "rerank" | "systemone" | "models";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatState {
  model: string;
  system: string;
  turns: ChatTurn[];
  draft: string;
  stream: boolean;
  /** Render assistant replies as Markdown (off: raw text). */
  markdown: boolean;
  /** Kept as typed; empty means "gateway default". */
  temperature: string;
  maxTokens: string;
  running: boolean;
  result: PlaygroundResult | null;
}

export interface EmbeddingsState {
  model: string;
  /** One input per line. */
  input: string;
  running: boolean;
  result: PlaygroundResult | null;
}

export interface RerankState {
  model: string;
  query: string;
  /** One document per line. */
  documents: string;
  topN: string;
  running: boolean;
  result: PlaygroundResult | null;
}

export interface SystemOneState {
  model: string;
  state: string;
  /** Send `state` parsed as JSON instead of as a string. */
  stateAsJson: boolean;
  questions: string;
  running: boolean;
  result: PlaygroundResult | null;
}

export interface ModelsState {
  running: boolean;
  result: PlaygroundResult | null;
}

export interface GatewayPlayground {
  tab: PlaygroundTab;
  chat: ChatState;
  embeddings: EmbeddingsState;
  rerank: RerankState;
  systemone: SystemOneState;
  models: ModelsState;
}

type FormTab = Exclude<keyof GatewayPlayground, "tab">;
type Patch<T> = Partial<T> | ((previous: T) => Partial<T>);

/** The example from lumen docs/systemone/systemone.md. */
export const SYSTEMONE_EXAMPLE_STATE = "Help! My payouts have been failing for 3 days.";
export const SYSTEMONE_EXAMPLE_QUESTIONS = JSON.stringify(
  {
    is_urgent: {
      type: "noul",
      instructions: "Does this message convey urgency?",
    },
    department: {
      type: "choice",
      instructions: "Which team should handle this ticket?",
      criteria: { technical: "Bugs and outages", billing: "Payments and invoices" },
    },
  },
  null,
  2,
);

function initialPlayground(): GatewayPlayground {
  return {
    tab: "chat",
    chat: {
      model: "",
      system: "",
      turns: [],
      draft: "",
      stream: true,
      markdown: true,
      temperature: "",
      maxTokens: "",
      running: false,
      result: null,
    },
    embeddings: {
      model: "",
      input: "The quick brown fox jumps over the lazy dog\nLumen routes every request to the right provider",
      running: false,
      result: null,
    },
    rerank: {
      model: "",
      query: "How do I reset my password?",
      documents: [
        "Click “Forgot password” on the sign-in page to receive a reset link.",
        "Our offices are closed on public holidays.",
        "Passwords must be at least 12 characters long.",
      ].join("\n"),
      topN: "",
      running: false,
      result: null,
    },
    systemone: {
      model: "",
      state: SYSTEMONE_EXAMPLE_STATE,
      stateAsJson: false,
      questions: SYSTEMONE_EXAMPLE_QUESTIONS,
      running: false,
      result: null,
    },
    models: { running: false, result: null },
  };
}

interface PlaygroundStore {
  gateways: Record<string, GatewayPlayground>;
  setTab(gatewayId: string, tab: PlaygroundTab): void;
  patch<K extends FormTab>(gatewayId: string, key: K, patch: Patch<GatewayPlayground[K]>): void;
}

export const usePlaygroundStore = create<PlaygroundStore>()((set) => ({
  gateways: {},
  setTab: (gatewayId, tab) =>
    set((store) => ({
      gateways: {
        ...store.gateways,
        [gatewayId]: { ...(store.gateways[gatewayId] ?? initialPlayground()), tab },
      },
    })),
  patch: (gatewayId, key, patch) =>
    set((store) => {
      const current = store.gateways[gatewayId] ?? initialPlayground();
      const changes = typeof patch === "function" ? patch(current[key]) : patch;
      return {
        gateways: {
          ...store.gateways,
          [gatewayId]: { ...current, [key]: { ...current[key], ...changes } },
        },
      };
    }),
}));

const fallback = initialPlayground();

/** Current state of one gateway's playground (defaults until first write). */
export function playgroundState(gatewayId: string): GatewayPlayground {
  return usePlaygroundStore.getState().gateways[gatewayId] ?? fallback;
}

export function usePlaygroundTab(gatewayId: string): [PlaygroundTab, (tab: PlaygroundTab) => void] {
  const tab = usePlaygroundStore((store) => store.gateways[gatewayId]?.tab ?? fallback.tab);
  const setTab = usePlaygroundStore((store) => store.setTab);
  return [tab, (next) => setTab(gatewayId, next)];
}

/** One sub-tab's state and a patcher bound to it. */
export function usePlaygroundForm<K extends FormTab>(
  gatewayId: string,
  key: K,
): [GatewayPlayground[K], (patch: Patch<GatewayPlayground[K]>) => void] {
  const state = usePlaygroundStore(
    (store) => (store.gateways[gatewayId] ?? fallback)[key],
  );
  const patch = usePlaygroundStore((store) => store.patch);
  return [state, (changes) => patch(gatewayId, key, changes)];
}
