"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { initiallyOpen, summarize } from "./visual";

type Container = unknown[] | Record<string, unknown>;

const isContainer = (value: unknown): value is Container =>
  value !== null && typeof value === "object";

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === "string") {
    // JSON escapes (\n, \") keep multi-line strings readable on one line.
    return <span className="break-all text-success">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "number") return <span className="text-sky-600 dark:text-sky-400">{value}</span>;
  if (typeof value === "boolean") return <span className="text-warning">{String(value)}</span>;
  return <span>{String(value)}</span>;
}

function Key({ name }: { name: string | number }) {
  return typeof name === "number" ? (
    <span className="text-muted-foreground">{name}: </span>
  ) : (
    <span className="text-foreground">&quot;{name}&quot;: </span>
  );
}

function Node({
  name,
  value,
  depth,
  last,
}: {
  name?: string | number;
  value: unknown;
  depth: number;
  last: boolean;
}) {
  const container = isContainer(value);
  const [open, setOpen] = useState(() => (container ? initiallyOpen(value, depth) : false));
  const comma = last ? "" : ",";

  if (!container) {
    return (
      <div className="pl-4">
        {name !== undefined && <Key name={name} />}
        <Primitive value={value} />
        {comma}
      </div>
    );
  }

  const array = Array.isArray(value);
  const entries: [string | number, unknown][] = array
    ? value.map((child, index) => [index, child])
    : Object.entries(value);
  const [openBracket, closeBracket] = array ? ["[", "]"] : ["{", "}"];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="group flex w-full items-start text-left hover:bg-muted/60"
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="pl-0.5">
          {name !== undefined && <Key name={name} />}
          {openBracket}
          {!open && (
            <>
              <span className="mx-1 rounded bg-muted px-1 text-muted-foreground">
                {summarize(value)}
              </span>
              {closeBracket}
              {comma}
            </>
          )}
        </span>
      </button>
      {open && (
        <>
          <div className="ml-[7px] border-l border-border/60 pl-2">
            {entries.map(([key, child], index) => (
              <Node
                key={key}
                name={key}
                value={child}
                depth={depth + 1}
                last={index === entries.length - 1}
              />
            ))}
          </div>
          <div className="pl-4">
            {closeBracket}
            {comma}
          </div>
        </>
      )}
    </div>
  );
}

/** Collapsible, syntax-colored JSON; plain text for non-JSON bodies. */
export function JsonTree({ value }: { value: unknown }) {
  if (typeof value === "string" || value === undefined) {
    return <span className="whitespace-pre-wrap break-all">{value ?? ""}</span>;
  }
  return <Node value={value} depth={0} last />;
}
