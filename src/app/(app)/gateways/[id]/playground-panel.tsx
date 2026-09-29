"use client";

import type { GatewayPublic } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatForm } from "./playground/chat-form";
import { EmbeddingsForm } from "./playground/embeddings-form";
import { Inspector } from "./playground/inspector";
import { ModelsView } from "./playground/models-view";
import { RerankForm } from "./playground/rerank-form";
import type { PlaygroundEndpoint } from "./playground/result";
import { SystemOneForm } from "./playground/systemone-form";
import { usePlaygroundStore, usePlaygroundTab, type PlaygroundTab } from "./playground/store";

const SUB_TABS: {
  tab: PlaygroundTab;
  label: string;
  endpoint: PlaygroundEndpoint;
  Form: (props: { gatewayId: string }) => React.ReactNode;
}[] = [
  { tab: "chat", label: "Chat", endpoint: "chat/completions", Form: ChatForm },
  { tab: "embeddings", label: "Embeddings", endpoint: "embeddings", Form: EmbeddingsForm },
  { tab: "rerank", label: "Rerank", endpoint: "rerank", Form: RerankForm },
  { tab: "systemone", label: "SystemOne", endpoint: "systemone", Form: SystemOneForm },
  { tab: "models", label: "Models", endpoint: "models", Form: ModelsView },
];

function SubTabInspector({
  gateway,
  tab,
  endpoint,
}: {
  gateway: GatewayPublic;
  tab: PlaygroundTab;
  endpoint: PlaygroundEndpoint;
}) {
  const state = usePlaygroundStore((store) => store.gateways[gateway.id]?.[tab]);
  return (
    <Inspector
      endpoint={endpoint}
      result={state?.result ?? null}
      running={state?.running ?? false}
      gatewayUrl={gateway.url}
    />
  );
}

/** Send real requests to each /v1 endpoint with the gateway's configured models. */
export function PlaygroundPanel({ gateway }: { gateway: GatewayPublic }) {
  const [tab, setTab] = usePlaygroundTab(gateway.id);
  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as PlaygroundTab)} className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList className="max-w-full overflow-x-auto">
          {SUB_TABS.map((entry) => (
            <TabsTrigger key={entry.tab} value={entry.tab}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className="text-xs text-muted-foreground">
          Real calls with the gateway&apos;s playground key. They count toward usage.
        </p>
      </div>
      {SUB_TABS.map(({ tab: value, endpoint, Form }) => (
        <TabsContent key={value} value={value}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              <Form gatewayId={gateway.id} />
            </div>
            <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
              <SubTabInspector gateway={gateway} tab={value} endpoint={endpoint} />
            </div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
