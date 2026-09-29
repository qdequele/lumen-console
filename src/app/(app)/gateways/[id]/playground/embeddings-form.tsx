"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRunner } from "./client";
import { copyText } from "./inspector";
import { ModelSelect } from "./model-select";
import { buildEmbeddingsRequest } from "./requests";
import { okBody, SendButton } from "./shared";
import { usePlaygroundForm } from "./store";

interface EmbeddingsResponse {
  data?: { index: number; embedding: number[] | string }[];
}

export function EmbeddingsForm({ gatewayId }: { gatewayId: string }) {
  const [state, patch] = usePlaygroundForm(gatewayId, "embeddings");
  const run = useRunner(gatewayId, "embeddings", "embeddings");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const vectors = okBody<EmbeddingsResponse>(state.result)?.data ?? [];
  const dimensions = Array.isArray(vectors[0]?.embedding) ? vectors[0].embedding.length : undefined;

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const built = buildEmbeddingsRequest(state);
          setErrors("errors" in built ? built.errors : {});
          if ("request" in built) void run(built.request);
        }}
      >
        <ModelSelect
          gatewayId={gatewayId}
          capability="embed"
          value={state.model}
          onChange={(model) => patch({ model })}
          error={errors.model}
        />
        <div className="space-y-1.5">
          <Label htmlFor="embeddings-input">Input, one per line</Label>
          <Textarea
            id="embeddings-input"
            rows={6}
            value={state.input}
            onChange={(event) => patch({ input: event.target.value })}
            aria-invalid={Boolean(errors.input)}
          />
          {errors.input && <p className="text-xs text-destructive">{errors.input}</p>}
        </div>
        <div className="flex justify-end">
          <SendButton running={state.running} />
        </div>
      </form>

      {vectors.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
            <span className="font-medium">
              {vectors.length} vector{vectors.length === 1 ? "" : "s"}
            </span>
            {dimensions !== undefined && (
              <span className="text-muted-foreground tabular-nums">{dimensions} dimensions</span>
            )}
          </div>
          <ul className="divide-y">
            {vectors.map((vector) => (
              <li key={vector.index} className="flex items-center gap-3 px-3 py-2">
                <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
                  #{vector.index}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-xs">
                  {Array.isArray(vector.embedding)
                    ? `[${vector.embedding.slice(0, 8).map((value) => value.toFixed(4)).join(", ")}${vector.embedding.length > 8 ? ", …" : ""}]`
                    : `base64: ${vector.embedding.slice(0, 48)}…`}
                </code>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Copy vector ${vector.index}`}
                  onClick={() => void copyText(JSON.stringify(vector.embedding), "Vector copied")}
                >
                  <Copy />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
