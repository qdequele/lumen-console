"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRunner } from "./client";
import { ModelSelect } from "./model-select";
import { buildSystemOneRequest } from "./requests";
import { Bar, okBody, SendButton } from "./shared";
import { SYSTEMONE_EXAMPLE_QUESTIONS, SYSTEMONE_EXAMPLE_STATE, usePlaygroundForm } from "./store";

type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence?: number }
  | { type: string; [field: string]: unknown };

function AnswerView({ id, answer }: { id: string; answer: Answer }) {
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{id}</span>
        <Badge variant="outline">{answer.type}</Badge>
      </div>
      {answer.type === "noul" && typeof answer.noul === "number" ? (
        <div className="flex items-center gap-2">
          <Bar value={answer.noul} highlight />
          <span className="w-14 text-right text-xs tabular-nums">{answer.noul.toFixed(3)}</span>
        </div>
      ) : answer.type === "choice" && typeof answer.probabilities === "object" && answer.probabilities ? (
        <div className="space-y-1.5">
          {Object.entries(answer.probabilities as Record<string, number>).map(([option, probability]) => (
            <div key={option} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className={option === answer.choice ? "font-medium" : "text-muted-foreground"}>
                {option}
              </span>
              <Bar value={probability} highlight={option === answer.choice} />
              <span className="text-right text-xs tabular-nums">{probability.toFixed(3)}</span>
            </div>
          ))}
          {typeof answer.confidence === "number" && (
            <p className="text-xs text-muted-foreground">
              Confidence <span className="tabular-nums">{answer.confidence.toFixed(3)}</span>
            </p>
          )}
        </div>
      ) : (
        <pre className="overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-xs">
          {JSON.stringify(answer, null, 2)}
        </pre>
      )}
    </li>
  );
}

export function SystemOneForm({ gatewayId }: { gatewayId: string }) {
  const [state, patch] = usePlaygroundForm(gatewayId, "systemone");
  const run = useRunner(gatewayId, "systemone", "systemone");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const answers = okBody<{ answers?: Record<string, Answer> }>(state.result)?.answers;

  return (
    <div className="space-y-4">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const built = buildSystemOneRequest(state);
          setErrors("errors" in built ? built.errors : {});
          if ("request" in built) void run(built.request);
        }}
      >
        <ModelSelect
          gatewayId={gatewayId}
          capability="systemone"
          value={state.model}
          onChange={(model) => patch({ model })}
          error={errors.model}
        />
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="systemone-state">State</Label>
            <div className="flex items-center gap-2">
              <Switch
                id="systemone-state-json"
                checked={state.stateAsJson}
                onCheckedChange={(stateAsJson) => patch({ stateAsJson })}
              />
              <Label htmlFor="systemone-state-json" className="text-xs text-muted-foreground">
                Send as JSON
              </Label>
            </div>
          </div>
          <Textarea
            id="systemone-state"
            rows={4}
            className={state.stateAsJson ? "font-mono text-xs" : undefined}
            value={state.state}
            onChange={(event) => patch({ state: event.target.value })}
            aria-invalid={Boolean(errors.state)}
          />
          {errors.state && <p className="text-xs text-destructive">{errors.state}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="systemone-questions">Questions (JSON)</Label>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() =>
                patch({
                  state: SYSTEMONE_EXAMPLE_STATE,
                  stateAsJson: false,
                  questions: SYSTEMONE_EXAMPLE_QUESTIONS,
                })
              }
            >
              <RotateCcw /> Reset example
            </Button>
          </div>
          <Textarea
            id="systemone-questions"
            rows={12}
            spellCheck={false}
            className="font-mono text-xs"
            value={state.questions}
            onChange={(event) => patch({ questions: event.target.value })}
            aria-invalid={Boolean(errors.questions)}
          />
          {errors.questions && <p className="text-xs text-destructive">{errors.questions}</p>}
        </div>
        <div className="flex justify-end">
          <SendButton running={state.running} />
        </div>
      </form>

      {answers && Object.keys(answers).length > 0 && (
        <div className="rounded-lg border">
          <p className="border-b px-3 py-2 text-sm font-medium">Answers</p>
          <ul className="divide-y">
            {Object.entries(answers).map(([id, answer]) => (
              <AnswerView key={id} id={id} answer={answer} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
