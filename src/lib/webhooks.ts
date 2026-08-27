import type { WebhookEventKind, WebhookSettings } from "@/lib/types";

/**
 * Outbound budget webhooks (ADR 011): shared between the Webhooks panel and
 * the /api/gateways/[id]/webhooks routes so the browser and the server apply
 * the exact same rules the gateway enforces. The gateway re-validates
 * authoritatively on PUT; these checks exist to answer with a precise 400
 * before a round trip.
 */

/** Labelled by what a billing backend does with each event, not just the name. */
export const WEBHOOK_EVENTS: {
  kind: WebhookEventKind;
  label: string;
  description: string;
}[] = [
  {
    kind: "budget.threshold",
    label: "Budget threshold crossed",
    description:
      "Spend passed one of the configured percentages — auto-recharge via POST /admin/keys/{id}/grant before requests start failing.",
  },
  {
    kind: "budget.exhausted",
    label: "Budget exhausted",
    description:
      "A key or group hit its cap; its requests now fail with 402 LM-4001 until a grant lands.",
  },
  {
    kind: "key.disabled",
    label: "Key disabled",
    description: "A key was switched off — pause the customer's integration or alert them.",
  },
  {
    kind: "key.rotated",
    label: "Key rotated",
    description: "A key got a new plaintext — invalidate any cached credential state.",
  },
  {
    kind: "key.deleted",
    label: "Key deleted",
    description: "A key was soft-deleted — close out the customer's provisioning record.",
  },
];

export const WEBHOOK_EVENT_KINDS = WEBHOOK_EVENTS.map((event) => event.kind);

/** The gateway's own defaults: what an omitted field becomes on PUT. */
export const WEBHOOK_DEFAULTS: Omit<WebhookSettings, "url"> = {
  signing_key_env: null,
  events: ["budget.threshold", "budget.exhausted", "key.disabled"],
  thresholds: [50, 80, 95],
  channel_capacity: 1024,
  timeout_ms: 5000,
  max_attempts: 5,
  retry_base_ms: 500,
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Mirror of the gateway's PUT /admin/webhooks validation; null when valid. */
export function validateWebhookSettings(settings: WebhookSettings): string | null {
  if (!/^https?:\/\/.+/.test(settings.url.trim())) {
    return "the receiver URL must start with http:// or https://";
  }
  if (settings.events.length === 0) {
    return "select at least one event to deliver";
  }
  for (const event of settings.events) {
    if (!(WEBHOOK_EVENT_KINDS as string[]).includes(event)) {
      return `unknown event kind "${event}"`;
    }
  }
  const wantsThresholds = settings.events.includes("budget.threshold");
  if (wantsThresholds && settings.thresholds.length === 0) {
    return "budget.threshold needs at least one threshold percentage";
  }
  for (const threshold of settings.thresholds) {
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
      return "thresholds must be whole percentages between 1 and 100";
    }
  }
  for (const [name, value] of [
    ["timeout_ms", settings.timeout_ms],
    ["max_attempts", settings.max_attempts],
    ["retry_base_ms", settings.retry_base_ms],
    ["channel_capacity", settings.channel_capacity],
  ] as const) {
    if (!isPositiveInteger(value)) {
      return `\`${name}\` must be a positive integer`;
    }
  }
  return null;
}
