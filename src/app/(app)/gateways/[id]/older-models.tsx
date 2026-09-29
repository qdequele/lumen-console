"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { type Dated, releaseLabel, splitByAge } from "@/lib/models";
import { cn } from "@/lib/utils";

/** Newest-first rows, with models released over a year ago folded until asked for. */
export function useOlderModels<T extends Dated>(models: readonly T[]) {
  const [showOlder, setShowOlder] = useState(false);
  const { sorted, recent, older } = splitByAge(models);
  return {
    rows: showOlder ? sorted : recent,
    olderCount: older.length,
    showOlder,
    toggleOlder: () => setShowOlder((shown) => !shown),
  };
}

/** Full-width footer under a model table; renders nothing when nothing is folded. */
export function OlderModelsToggle({
  count,
  shown,
  onToggle,
  className,
}: {
  count: number;
  shown: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      aria-expanded={shown}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-center gap-1.5 border-t px-5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
        className,
      )}
    >
      <ChevronDown className={cn("size-3.5 transition-transform", shown && "rotate-180")} />
      {shown
        ? "Hide older models"
        : `Show ${count} older model${count === 1 ? "" : "s"} (released over a year ago)`}
    </button>
  );
}

export function ReleaseDate({ date }: { date?: string }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  return (
    <time dateTime={date} className="whitespace-nowrap tabular-nums">
      {releaseLabel(date)}
    </time>
  );
}
