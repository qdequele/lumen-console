"use client";

import { useState } from "react";
import { isValidReleaseDate } from "@/lib/models";
import type { ModelBody, ModelConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const CAPABILITIES = ["chat", "embed", "rerank", "systemone"] as const;

function TogglePill({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

interface ModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  /** Present when editing. */
  existing?: ModelConfig;
  /** Every other model id on the gateway — candidates for fallbacks. */
  otherModelIds: string[];
  pending: boolean;
  onSubmit: (model: ModelBody) => void;
}

export function ModelDialog({
  open,
  onOpenChange,
  providerName,
  existing,
  otherModelIds,
  pending,
  onSubmit,
}: ModelDialogProps) {
  const [id, setId] = useState("");
  const [upstreamId, setUpstreamId] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>(["chat"]);
  const [image, setImage] = useState(false);
  const [costIn, setCostIn] = useState("");
  const [costOut, setCostOut] = useState("");
  const [fallbacks, setFallbacks] = useState<string[]>([]);
  const [releaseDate, setReleaseDate] = useState("");

  // Re-seed on open transition, during render (no effect needed).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setId(existing?.id ?? "");
      setUpstreamId(existing?.upstream_id ?? "");
      setCapabilities(existing?.capabilities ?? ["chat"]);
      setImage(existing?.modalities?.includes("image") ?? false);
      setCostIn(existing?.cost_per_1m_input?.toString() ?? "");
      setCostOut(existing?.cost_per_1m_output?.toString() ?? "");
      setFallbacks(existing?.fallbacks ?? []);
      setReleaseDate(existing?.release_date ?? "");
    }
  }

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  const priceValid = (value: string) =>
    value.trim() === "" || (Number.isFinite(Number(value)) && Number(value) >= 0);
  const valid =
    id.trim() !== "" &&
    capabilities.length > 0 &&
    priceValid(costIn) &&
    priceValid(costOut) &&
    (releaseDate === "" || isValidReleaseDate(releaseDate));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? `Edit “${existing.id}”` : `Add model to “${providerName}”`}
          </DialogTitle>
          <DialogDescription>
            The id is what clients send — it is yours to choose, and unique across every provider
            on this gateway.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="model-id">Model id</Label>
              <Input
                id="model-id"
                className="font-mono text-sm"
                placeholder="gpt-4o"
                value={id}
                onChange={(event) => setId(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-upstream">Upstream id (optional)</Label>
              <Input
                id="model-upstream"
                className="font-mono text-sm"
                placeholder="defaults to the id"
                value={upstreamId}
                onChange={(event) => setUpstreamId(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Capabilities</Label>
            <div className="flex flex-wrap gap-2">
              {CAPABILITIES.map((capability) => (
                <TogglePill
                  key={capability}
                  label={capability}
                  active={capabilities.includes(capability)}
                  onToggle={() => setCapabilities((list) => toggle(list, capability))}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="model-release">Release date (optional)</Label>
              <Input
                id="model-release"
                type="date"
                min="1970-01-01"
                value={releaseDate}
                onChange={(event) => setReleaseDate(event.target.value)}
              />
            </div>
            <div className="flex h-9 items-center gap-2">
              <Switch id="model-image" checked={image} onCheckedChange={setImage} />
              <Label htmlFor="model-image" className="text-sm text-muted-foreground">
                Accepts image input (vision)
              </Label>
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Model lists show the newest first and fold ones released over a year ago. Needs
            lumen 0.6.1 or later; never used for routing.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="model-cost-in">$ / 1M input tokens</Label>
              <Input
                id="model-cost-in"
                inputMode="decimal"
                placeholder="free"
                value={costIn}
                onChange={(event) => setCostIn(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-cost-out">$ / 1M output tokens</Label>
              <Input
                id="model-cost-out"
                inputMode="decimal"
                placeholder="free"
                value={costOut}
                onChange={(event) => setCostOut(event.target.value)}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Prices drive cost accounting and hard budgets; a model without prices costs $0.
          </p>

          {otherModelIds.length > 0 && (
            <div className="space-y-2">
              <Label>Fallbacks (tried in order when this provider fails)</Label>
              <div className="flex flex-wrap gap-2">
                {otherModelIds.map((candidate) => (
                  <TogglePill
                    key={candidate}
                    label={candidate}
                    active={fallbacks.includes(candidate)}
                    onToggle={() => setFallbacks((list) => toggle(list, candidate))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={!valid || pending}
            onClick={() =>
              // Every field is sent, with ModelBody's clear markers for empty
              // ones (undefined would be dropped by JSON and keep the old value).
              onSubmit({
                id: id.trim(),
                upstream_id: upstreamId.trim(),
                capabilities,
                modalities: image ? ["text", "image"] : [],
                cost_per_1m_input: costIn.trim() === "" ? null : Number(costIn),
                cost_per_1m_output: costOut.trim() === "" ? null : Number(costOut),
                fallbacks,
                release_date: releaseDate,
              })
            }
          >
            {pending ? "Saving…" : existing ? "Save changes" : "Add model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
