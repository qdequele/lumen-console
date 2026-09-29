"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OlderModelsToggle, ReleaseDate, useOlderModels } from "../older-models";
import { useRunner } from "./client";
import { okBody } from "./shared";
import { playgroundState, usePlaygroundForm } from "./store";

interface ModelsResponse {
  data?: { id: string; owned_by?: string; capabilities?: string[]; release_date?: string }[];
}

/** GET /v1/models: what the playground key actually sees. */
export function ModelsView({ gatewayId }: { gatewayId: string }) {
  const [state] = usePlaygroundForm(gatewayId, "models");
  const run = useRunner(gatewayId, "models", "models");
  const models = okBody<ModelsResponse>(state.result)?.data;
  const { rows, olderCount, showOlder, toggleOlder } = useOlderModels(models ?? []);

  // Fetch once on first visit; afterwards only on Refresh.
  useEffect(() => {
    const current = playgroundState(gatewayId).models;
    if (!current.result && !current.running) void run(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <code className="font-mono">GET /v1/models</code>, as the playground key sees it.
        </p>
        <Button variant="outline" size="sm" disabled={state.running} onClick={() => void run(null)}>
          <RefreshCw className={state.running ? "animate-spin" : undefined} /> Refresh
        </Button>
      </div>
      {models && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Owned by</TableHead>
                <TableHead>Capabilities</TableHead>
                <TableHead>Released</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    The gateway lists no models.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="font-mono text-xs">{model.id}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{model.owned_by ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(model.capabilities ?? []).map((capability) => (
                        <Badge key={capability} variant="secondary">
                          {capability}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <ReleaseDate date={model.release_date} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <OlderModelsToggle count={olderCount} shown={showOlder} onToggle={toggleOlder} />
        </div>
      )}
    </div>
  );
}
