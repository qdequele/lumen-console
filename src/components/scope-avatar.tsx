"use client";

import { cn } from "@/lib/utils";

/**
 * Deterministic gradient avatar: the same identity always renders the same
 * two-stop gradient, so people learn to recognize their teams and account
 * at a glance without uploaded images.
 */
const GRADIENTS = [
  ["#ff4d4d", "#f9cb28"],
  ["#007cf0", "#00dfd8"],
  ["#7928ca", "#ff0080"],
  ["#ff4d00", "#f9cb28"],
  ["#00dfd8", "#7928ca"],
  ["#f81ce5", "#7928ca"],
] as const;

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function ScopeAvatar({
  seed,
  className,
}: {
  seed: string;
  className?: string;
}) {
  const [from, to] = GRADIENTS[hashCode(seed) % GRADIENTS.length];
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    />
  );
}
