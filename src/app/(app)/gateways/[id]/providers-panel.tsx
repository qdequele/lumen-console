"use client";

import { useState } from "react";
import {
  CircleAlert,
  EllipsisVertical,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useAddModel,
  useAddProvider,
  useDeleteModel,
  useDeleteProvider,
  useGatewayConfig,
  useProviders,
  usePutProviderKey,
  useUpdateModel,
  useUpdateProvider,
} from "@/lib/hooks";
import { usd } from "@/lib/format";
import type { ModelConfig, ProviderConfig, ProviderStatus } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ProviderDialog } from "./provider-dialog";
import { ModelDialog } from "./model-dialog";

function HealthDot({ status }: { status?: ProviderStatus }) {
  const state = status?.status ?? "unknown";
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "size-2 rounded-full",
          state === "up" && "bg-success",
          state === "down" && "bg-destructive",
          state === "unknown" && "bg-muted-foreground/40",
        )}
      />
      {state}
      {status?.latency_ms !== undefined && ` · ${status.latency_ms} ms`}
    </span>
  );
}

export function ProvidersPanel({
  gatewayId,
  canAdmin,
}: {
  gatewayId: string;
  canAdmin: boolean;
}) {
  const config = useGatewayConfig(gatewayId);
  const health = useProviders(gatewayId);

  const addProvider = useAddProvider(gatewayId);
  const updateProvider = useUpdateProvider(gatewayId);
  const deleteProvider = useDeleteProvider(gatewayId);
  const addModel = useAddModel(gatewayId);
  const updateModel = useUpdateModel(gatewayId);
  const deleteModel = useDeleteModel(gatewayId);
  const putKey = usePutProviderKey(gatewayId);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [addingModelTo, setAddingModelTo] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<{
    provider: string;
    model: ModelConfig;
  } | null>(null);
  const [keyingFor, setKeyingFor] = useState<string | null>(null);
  const [secret, setSecret] = useState("");

  const providers = config.data?.providers ?? [];
  const allIds = providers.flatMap((provider) => provider.models.map((model) => model.id));

  if (config.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlert className="size-4" />
        <AlertTitle>Could not load the gateway config</AlertTitle>
        <AlertDescription>{(config.error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Providers and models from the gateway config, applied by hot reload on save. Health
          probes are observability only — request routing uses the live circuit breaker.
        </p>
        {canAdmin && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add provider
          </Button>
        )}
      </div>

      {config.isLoading && <Skeleton className="h-64 rounded-lg" />}

      {config.data && providers.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-sm font-medium">No providers configured</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add an upstream provider, then expose its models to clients.
          </p>
        </div>
      )}

      {providers.map((provider) => (
        <section key={provider.name} className="rounded-lg border">
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">{provider.name}</h2>
                <Badge variant="secondary">{provider.kind}</Badge>
                <HealthDot status={health.data?.[provider.name]} />
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {provider.api_key_env ?? "key stored on gateway"}
                {provider.base_url && ` · ${provider.base_url}`}
              </p>
            </div>
            {canAdmin && (
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setAddingModelTo(provider.name)}>
                  <Plus className="size-4" /> Model
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${provider.name}`}
                    >
                      <EllipsisVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(provider)}>
                      <Pencil className="size-4" /> Edit provider
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setKeyingFor(provider.name)}>
                      <KeyRound className="size-4" /> Set API key
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => deleteProvider.mutate(provider.name)}
                    >
                      <Trash2 className="size-4" /> Remove provider
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {provider.models.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted-foreground">
              No models exposed yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Model</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead className="text-right">$ / 1M in · out</TableHead>
                  <TableHead>Fallbacks</TableHead>
                  {canAdmin && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {provider.models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className="pl-5">
                      <p className="font-mono text-sm">{model.id}</p>
                      {model.upstream_id && (
                        <p className="font-mono text-xs text-muted-foreground">
                          → {model.upstream_id}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {model.capabilities.map((capability) => (
                          <Badge key={capability} variant="outline">
                            {capability}
                          </Badge>
                        ))}
                        {model.modalities?.includes("image") && (
                          <Badge variant="outline">vision</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {model.cost_per_1m_input !== undefined ||
                      model.cost_per_1m_output !== undefined
                        ? `${usd(model.cost_per_1m_input ?? 0)} · ${usd(model.cost_per_1m_output ?? 0)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {model.fallbacks?.join(", ") ?? "—"}
                    </TableCell>
                    {canAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${model.id}`}
                            >
                              <EllipsisVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                setEditingModel({ provider: provider.name, model })
                              }
                            >
                              <Pencil className="size-4" /> Edit model
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                deleteModel.mutate({
                                  provider: provider.name,
                                  modelId: model.id,
                                })
                              }
                            >
                              <Trash2 className="size-4" /> Remove model
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ))}

      <ProviderDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        pending={addProvider.isPending}
        onSubmit={(values) =>
          addProvider.mutate(
            {
              name: values.name,
              kind: values.kind,
              api_key_env: values.api_key_env ?? undefined,
              base_url: values.base_url ?? undefined,
            },
            { onSuccess: () => setAddOpen(false) },
          )
        }
      />
      <ProviderDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        existing={editing ?? undefined}
        pending={updateProvider.isPending}
        onSubmit={(values) => {
          if (!editing) return;
          updateProvider.mutate(
            {
              name: editing.name,
              body: {
                kind: values.kind,
                api_key_env: values.api_key_env,
                base_url: values.base_url,
              },
            },
            { onSuccess: () => setEditing(null) },
          );
        }}
      />
      <ModelDialog
        open={addingModelTo !== null}
        onOpenChange={(open) => !open && setAddingModelTo(null)}
        providerName={addingModelTo ?? ""}
        otherModelIds={allIds}
        pending={addModel.isPending}
        onSubmit={(model) => {
          if (!addingModelTo) return;
          addModel.mutate(
            { provider: addingModelTo, body: model },
            { onSuccess: () => setAddingModelTo(null) },
          );
        }}
      />
      <ModelDialog
        open={editingModel !== null}
        onOpenChange={(open) => !open && setEditingModel(null)}
        providerName={editingModel?.provider ?? ""}
        existing={editingModel?.model}
        otherModelIds={allIds.filter((id) => id !== editingModel?.model.id)}
        pending={updateModel.isPending}
        onSubmit={(model) => {
          if (!editingModel) return;
          updateModel.mutate(
            {
              provider: editingModel.provider,
              modelId: editingModel.model.id,
              body: model,
            },
            { onSuccess: () => setEditingModel(null) },
          );
        }}
      />

      <Dialog
        open={keyingFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setKeyingFor(null);
            setSecret("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set API key for “{keyingFor}”</DialogTitle>
            <DialogDescription>
              Stored encrypted (AES-256-GCM under the gateway&apos;s master key) and applied via
              hot reload. When the provider&apos;s <code>api_key_env</code> resolves, the env
              value keeps precedence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="provider-secret">API key</Label>
            <Input
              id="provider-secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={secret.trim() === "" || putKey.isPending}
              onClick={() => {
                if (!keyingFor) return;
                putKey.mutate(
                  { name: keyingFor, key: secret },
                  {
                    onSuccess: () => {
                      setKeyingFor(null);
                      setSecret("");
                    },
                  },
                );
              }}
            >
              {putKey.isPending ? "Storing…" : "Store key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
