"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useGatewayConfig } from "@/lib/hooks";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export type Capability = "chat" | "embed" | "rerank" | "systemone";

const CAPABILITY_LABEL: Record<Capability, string> = {
  chat: "chat",
  embed: "embedding",
  rerank: "rerank",
  systemone: "SystemOne",
};

/** Models of the gateway's config that have `capability`, grouped by provider. */
export function ModelSelect({
  gatewayId,
  capability,
  value,
  onChange,
  error,
}: {
  gatewayId: string;
  capability: Capability;
  value: string;
  onChange: (model: string) => void;
  error?: string;
}) {
  const config = useGatewayConfig(gatewayId);
  const groups = (config.data?.providers ?? [])
    .map((provider) => ({
      provider: provider.name,
      models: provider.models.filter((model) => model.capabilities.includes(capability)),
    }))
    .filter((group) => group.models.length > 0);
  const ids = groups.flatMap((group) => group.models.map((model) => model.id));
  const first = ids[0];
  const known = ids.includes(value);

  // Default to the first matching model, and move off one that was removed.
  useEffect(() => {
    if (first !== undefined && !known) onChange(first);
  }, [first, known, onChange]);

  if (config.isLoading) return <Skeleton className="h-9 w-full" />;
  if (config.isError) {
    return (
      <p className="text-sm text-destructive">
        Could not load models: {(config.error as Error).message}
      </p>
    );
  }
  if (groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        No {CAPABILITY_LABEL[capability]} model on this gateway.{" "}
        <Link href={`/gateways/${gatewayId}?tab=providers`} className="text-foreground underline">
          Add one in Providers
        </Link>
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`model-${capability}`}>Model</Label>
      <Select value={known ? value : ""} onValueChange={onChange}>
        <SelectTrigger id={`model-${capability}`} className="w-full" aria-invalid={Boolean(error)}>
          <SelectValue placeholder="Pick a model" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectGroup key={group.provider}>
              <SelectLabel>{group.provider}</SelectLabel>
              {group.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <span className="font-mono text-xs">{model.id}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
