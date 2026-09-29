"use client";

import { use, useEffect } from "react";
import { useGateways } from "@/lib/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { OverviewPanel } from "./overview-panel";
import { UsagePanel } from "./usage-panel";
import { KeysPanel } from "./keys-panel";
import { GroupsPanel } from "./groups-panel";
import { ProvidersPanel } from "./providers-panel";
import { PlaygroundPanel } from "./playground-panel";
import { WebhooksPanel } from "./webhooks-panel";
import { SettingsPanel } from "./settings-panel";

const PANELS = [
  "overview",
  "usage",
  "keys",
  "groups",
  "providers",
  "playground",
  "webhooks",
  "settings",
] as const;
type Panel = (typeof PANELS)[number];

export default function GatewayPage({ params, searchParams }: PageProps<"/gateways/[id]">) {
  const { id } = use(params);
  const rawTab = use(searchParams).tab;
  const tab: Panel = PANELS.includes(rawTab as Panel) ? (rawTab as Panel) : "overview";

  const gateways = useGateways();
  const gateway = gateways.data?.find((entry) => entry.id === id);
  const canAdmin = gateway !== undefined && gateway.role !== "viewer";

  // Remember the last gateway visited: `/` redirects here next time.
  useEffect(() => {
    document.cookie = `lumen-last-gateway=${id}; path=/; max-age=31536000; samesite=lax`;
  }, [id]);

  if (gateways.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!gateway) {
    return (
      <p className="text-sm text-muted-foreground">
        Unknown gateway — it may have been removed, or you are not a member of its team.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {tab === "overview" && <OverviewPanel gateway={gateway} />}
      {tab === "usage" && <UsagePanel gatewayId={id} />}
      {tab === "keys" && <KeysPanel gatewayId={id} canAdmin={canAdmin} />}
      {tab === "groups" && <GroupsPanel gatewayId={id} canAdmin={canAdmin} />}
      {tab === "providers" && <ProvidersPanel gatewayId={id} canAdmin={canAdmin} />}
      {tab === "playground" && <PlaygroundPanel gateway={gateway} />}
      {tab === "webhooks" && <WebhooksPanel gatewayId={id} canAdmin={canAdmin} />}
      {tab === "settings" && <SettingsPanel gateway={gateway} />}
    </div>
  );
}
