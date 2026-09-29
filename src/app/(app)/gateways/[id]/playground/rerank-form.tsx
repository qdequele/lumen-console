"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useRunner } from "./client";
import { ModelSelect } from "./model-select";
import { buildRerankRequest } from "./requests";
import { Bar, okBody, SendButton } from "./shared";
import { usePlaygroundForm } from "./store";

interface RerankResponse {
  results?: { index: number; relevance_score: number }[];
}

export function RerankForm({ gatewayId }: { gatewayId: string }) {
  const [state, patch] = usePlaygroundForm(gatewayId, "rerank");
  const run = useRunner(gatewayId, "rerank", "rerank");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const results = okBody<RerankResponse>(state.result)?.results ?? [];
  // Map scores back to the documents that were actually sent.
  const sent = (state.result?.request as { documents?: string[] } | null)?.documents ?? [];

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const built = buildRerankRequest(state);
          setErrors("errors" in built ? built.errors : {});
          if ("request" in built) void run(built.request);
        }}
      >
        <ModelSelect
          gatewayId={gatewayId}
          capability="rerank"
          value={state.model}
          onChange={(model) => patch({ model })}
          error={errors.model}
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-1.5">
            <Label htmlFor="rerank-query">Query</Label>
            <Input
              id="rerank-query"
              value={state.query}
              onChange={(event) => patch({ query: event.target.value })}
              aria-invalid={Boolean(errors.query)}
            />
            {errors.query && <p className="text-xs text-destructive">{errors.query}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rerank-top-n">Top N</Label>
            <Input
              id="rerank-top-n"
              inputMode="numeric"
              placeholder="all"
              value={state.topN}
              onChange={(event) => patch({ topN: event.target.value })}
              aria-invalid={Boolean(errors.topN)}
            />
            {errors.topN && <p className="text-xs text-destructive">{errors.topN}</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rerank-documents">Documents, one per line</Label>
          <Textarea
            id="rerank-documents"
            rows={6}
            value={state.documents}
            onChange={(event) => patch({ documents: event.target.value })}
            aria-invalid={Boolean(errors.documents)}
          />
          {errors.documents && <p className="text-xs text-destructive">{errors.documents}</p>}
        </div>
        <div className="flex justify-end">
          <SendButton running={state.running} />
        </div>
      </form>

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead className="w-14">Index</TableHead>
                <TableHead className="w-40">Score</TableHead>
                <TableHead>Document</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result, rank) => (
                <TableRow key={result.index}>
                  <TableCell className="tabular-nums">{rank + 1}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{result.index}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Bar value={result.relevance_score} highlight={rank === 0} />
                      <span className="w-12 text-right text-xs tabular-nums">
                        {result.relevance_score.toFixed(3)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm" title={sent[result.index]}>
                    {sent[result.index] ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
