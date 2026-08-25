"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { ProviderConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Built-in provider kinds (docs/providers.md). */
const KINDS = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "vertex_ai",
  "bedrock",
  "mistral",
  "cohere",
  "jina",
  "voyage",
  "mixedbread",
  "pinecone",
  "nvidia",
  "tei",
  "ollama",
  "groq",
  "together",
  "fireworks",
  "deepseek",
  "openrouter",
  "perplexity",
  "xai",
  "deepinfra",
  "huggingface",
  "cloudflare",
  "vllm",
] as const;

export interface ProviderDialogValues {
  name: string;
  kind: string;
  /** `null` clears the field (edit); `undefined` means unset (create). */
  api_key_env: string | null | undefined;
  base_url: string | null | undefined;
}

interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; the name is the identity and stays fixed. */
  existing?: ProviderConfig;
  pending: boolean;
  onSubmit: (values: ProviderDialogValues) => void;
}

export function ProviderDialog({
  open,
  onOpenChange,
  existing,
  pending,
  onSubmit,
}: ProviderDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [kindOpen, setKindOpen] = useState(false);
  const [apiKeyEnv, setApiKeyEnv] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  // Re-seed on open transition, during render (no effect needed).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(existing?.name ?? "");
      setKind(existing?.kind ?? "");
      setKindOpen(false);
      setApiKeyEnv(existing?.api_key_env ?? "");
      setBaseUrl(existing?.base_url ?? "");
    }
  }

  const kindValid = kind.trim() !== "";
  const urlValid = baseUrl.trim() === "" || /^https?:\/\//.test(baseUrl.trim());
  const valid = (existing ? true : name.trim() !== "") && kindValid && urlValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit “${existing.name}”` : "Add provider"}</DialogTitle>
          <DialogDescription>
            Written to the gateway config and applied by hot reload. The API key itself lives in
            the named env var on the gateway host — never here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="provider-name">Name</Label>
              <Input
                id="provider-name"
                placeholder="openai"
                value={name}
                disabled={existing !== undefined}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-kind">Kind</Label>
              <Popover open={kindOpen} onOpenChange={setKindOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="provider-kind"
                    variant="outline"
                    role="combobox"
                    aria-expanded={kindOpen}
                    className="w-full justify-between font-normal"
                  >
                    {kind || <span className="text-muted-foreground">Pick a kind</span>}
                    <ChevronsUpDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search kinds…" />
                    <CommandList>
                      <CommandEmpty>No matching kind.</CommandEmpty>
                      <CommandGroup>
                        {KINDS.map((entry) => (
                          <CommandItem
                            key={entry}
                            value={entry}
                            onSelect={(value) => {
                              setKind(value);
                              setKindOpen(false);
                            }}
                          >
                            {entry}
                            <Check
                              className={cn(
                                "ml-auto size-4",
                                kind === entry ? "opacity-100" : "opacity-0",
                              )}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-env">API key env var</Label>
            <Input
              id="provider-env"
              className="font-mono text-sm"
              placeholder="OPENAI_API_KEY"
              value={apiKeyEnv}
              onChange={(event) => setApiKeyEnv(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to store the key encrypted on the gateway instead (“Set key”).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider-url">Base URL (optional)</Label>
            <Input
              id="provider-url"
              className="font-mono text-sm"
              placeholder="vendor default"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!valid || pending}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                kind: kind.trim(),
                api_key_env: apiKeyEnv.trim() || (existing ? null : undefined),
                base_url: baseUrl.trim() || (existing ? null : undefined),
              })
            }
          >
            {pending ? "Saving…" : existing ? "Save changes" : "Add provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
