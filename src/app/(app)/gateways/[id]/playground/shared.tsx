"use client";

import { Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PlaygroundResult } from "./result";

/** A 0..1 value as a horizontal bar. */
export function Bar({ value, highlight = false }: { value: number; highlight?: boolean }) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", highlight ? "bg-primary" : "bg-primary/40")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function SendButton({ running, disabled }: { running: boolean; disabled?: boolean }) {
  return (
    <Button type="submit" disabled={running || disabled}>
      {running ? <Loader2 className="animate-spin" /> : <Send />} Send
    </Button>
  );
}

/** The body of a successful result, or null. */
export function okBody<T>(result: PlaygroundResult | null): T | null {
  if (!result || result.status === null || result.status >= 300) return null;
  return result.body as T;
}
