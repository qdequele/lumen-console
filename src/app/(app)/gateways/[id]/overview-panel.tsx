"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { GatewaySnapshot } from "@/lib/types";
import { compact, timeAgo, usd } from "@/lib/format";
import { useGroups, useKeys } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** Landing view for one gateway: 24h numbers, provider state, quick links. */
export function OverviewPanel({ gateway }: { gateway: GatewaySnapshot }) {
  const keys = useKeys(gateway.id);
  const groups = useGroups(gateway.id);
  const providers = Object.entries(gateway.providers ?? {});

  const stats = [
    ["Spend, last 24h", gateway.usage24h ? usd(gateway.usage24h.cost) : "—"],
    ["Requests, last 24h", gateway.usage24h ? compact(gateway.usage24h.requests) : "—"],
    ["Tokens, last 24h", gateway.usage24h ? compact(gateway.usage24h.tokens_total) : "—"],
  ] as const;

  const links = [
    {
      href: `/gateways/${gateway.id}?tab=keys`,
      label: "API Keys",
      detail: keys.data ? `${keys.data.length} active` : "…",
    },
    {
      href: `/gateways/${gateway.id}?tab=groups`,
      label: "Budget Groups",
      detail: groups.data ? `${groups.data.length} pool${groups.data.length === 1 ? "" : "s"}` : "…",
    },
    {
      href: `/gateways/${gateway.id}?tab=usage`,
      label: "Usage",
      detail: "cost by model, provider, key",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 divide-y rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-medium">Providers</h2>
        </div>
        {providers.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No providers probed — health checks may be disabled on this gateway.
          </p>
        ) : (
          <ul className="divide-y">
            {providers.map(([name, status]) => (
              <li key={name} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    status.status === "up" && "bg-success",
                    status.status === "down" && "bg-destructive",
                    status.status === "unknown" && "bg-muted-foreground/40",
                  )}
                />
                <span className="font-medium">{name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {status.latency_ms !== undefined && `${status.latency_ms} ms · `}
                  {status.checked_at !== undefined ? timeAgo(status.checked_at) : "never probed"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group rounded-lg border p-4 transition-colors hover:border-muted-foreground/40"
          >
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {link.label}
              <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{link.detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
