import "server-only";
import type { GatewayConnection } from "@/lib/server/gateways";
import { lumenFetch, LumenError } from "@/lib/server/lumen";

/**
 * Webhook admin calls (ADR 011). A gateway that predates the feature answers
 * 404 on every /admin/webhooks path; mirror `fetchConfig`'s handling and
 * relay that as 501 so the panel renders an "upgrade required" explanation
 * instead of a broken state. A genuine "not configured" is NOT a 404 — it is
 * a 200 with `enabled: false`.
 */
export async function webhookFetch<T>(
  conn: GatewayConnection,
  path: string,
  init?: RequestInit,
): Promise<T> {
  try {
    return await lumenFetch<T>(conn, path, init);
  } catch (error) {
    if (error instanceof LumenError && error.status === 404) {
      throw new LumenError(
        "this gateway does not expose /admin/webhooks (ADR 011); upgrade it to manage webhooks from the console",
        501,
      );
    }
    throw error;
  }
}
