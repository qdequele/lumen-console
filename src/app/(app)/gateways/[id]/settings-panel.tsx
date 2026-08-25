"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDeleteGateway, useUpdateGateway } from "@/lib/hooks";
import type { GatewaySnapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SettingsCardProps {
  title: string;
  description: string;
  hint: string;
  saveLabel?: string;
  saveDisabled: boolean;
  pending: boolean;
  destructive?: boolean;
  onSave: () => void;
  children?: React.ReactNode;
}

/** One settings section: title, description, fields, footer with the action. */
function SettingsCard({
  title,
  description,
  hint,
  saveLabel = "Save",
  saveDisabled,
  pending,
  destructive = false,
  onSave,
  children,
}: SettingsCardProps) {
  return (
    <section className={`rounded-lg border ${destructive ? "border-destructive/50" : ""}`}>
      <div className="space-y-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
      <div
        className={`flex items-center justify-between gap-3 rounded-b-lg border-t px-5 py-3 ${
          destructive ? "border-destructive/50 bg-destructive/5" : "bg-muted/50"
        }`}
      >
        <p className="text-xs text-muted-foreground">{hint}</p>
        <Button
          size="sm"
          variant={destructive ? "destructive" : "default"}
          disabled={saveDisabled || pending}
          onClick={onSave}
        >
          {pending ? "…" : saveLabel}
        </Button>
      </div>
    </section>
  );
}

export function SettingsPanel({ gateway }: { gateway: GatewaySnapshot }) {
  const router = useRouter();
  const updateGateway = useUpdateGateway(gateway.id);
  const deleteGateway = useDeleteGateway();

  const [name, setName] = useState(gateway.name);
  const [region, setRegion] = useState(gateway.region === "unspecified" ? "" : gateway.region);
  const [url, setUrl] = useState(gateway.url);
  const [masterKey, setMasterKey] = useState("");
  const [confirmName, setConfirmName] = useState("");

  const generalDirty =
    name.trim() !== gateway.name ||
    (region.trim() || "unspecified") !== gateway.region;
  const urlDirty = url.trim().replace(/\/+$/, "") !== gateway.url;

  if (gateway.role === "viewer") {
    return (
      <p className="text-sm text-muted-foreground">
        Gateway settings require the admin role on the “{gateway.team_name}” team.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title="General"
        description="How this gateway appears across the console."
        hint="Display only — nothing on the gateway itself changes."
        saveDisabled={!generalDirty || name.trim() === ""}
        pending={updateGateway.isPending}
        onSave={() =>
          updateGateway.mutate({ name: name.trim(), region: region.trim() || undefined })
        }
      >
        <div className="grid gap-3 sm:max-w-md sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-region">Region</Label>
            <Input
              id="settings-region"
              placeholder="unspecified"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Admin endpoint"
        description="Where the console reaches this gateway's /admin API."
        hint="Must be reachable from the console server — keep admin ports on a private network."
        saveDisabled={!urlDirty || !/^https?:\/\//.test(url.trim())}
        pending={updateGateway.isPending}
        onSave={() => updateGateway.mutate({ url: url.trim() })}
      >
        <div className="space-y-2 sm:max-w-md">
          <Label htmlFor="settings-url">URL</Label>
          <Input
            id="settings-url"
            className="font-mono text-sm"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Master key"
        description="Replace the stored master key, e.g. after rotating LUMEN_MASTER_KEY on the gateway host."
        hint="Sealed with AES-256-GCM on the console server; the current key is never shown."
        saveLabel="Replace key"
        saveDisabled={masterKey.trim() === ""}
        pending={updateGateway.isPending}
        onSave={() =>
          updateGateway.mutate(
            { master_key: masterKey.trim() },
            { onSuccess: () => setMasterKey("") },
          )
        }
      >
        <div className="space-y-2 sm:max-w-md">
          <Label htmlFor="settings-master">New master key</Label>
          <Input
            id="settings-master"
            type="password"
            autoComplete="off"
            value={masterKey}
            onChange={(event) => setMasterKey(event.target.value)}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Remove from console"
        description="Unregisters this gateway and deletes its sealed master key. The gateway itself, its virtual keys and its usage history are untouched."
        hint={`Type “${gateway.name}” to confirm.`}
        saveLabel="Remove gateway"
        saveDisabled={confirmName !== gateway.name}
        pending={deleteGateway.isPending}
        destructive
        onSave={() =>
          deleteGateway.mutate(gateway.id, { onSuccess: () => router.push("/") })
        }
      >
        <div className="space-y-2 sm:max-w-md">
          <Label htmlFor="settings-confirm">Gateway name</Label>
          <Input
            id="settings-confirm"
            placeholder={gateway.name}
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
          />
        </div>
      </SettingsCard>
    </div>
  );
}
