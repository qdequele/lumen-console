import { formatDistanceToNow } from "date-fns";

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function usd(value: number): string {
  return usdFormatter.format(value);
}

export function compact(value: number): string {
  return compactFormatter.format(value);
}

export function budget(max: number | null): string {
  return max === null ? "unlimited" : usd(max);
}

export function fromUnix(seconds: number): Date {
  return new Date(seconds * 1000);
}

export function timeAgo(seconds: number): string {
  return formatDistanceToNow(fromUnix(seconds), { addSuffix: true });
}

/** since=<unix seconds> for a lookback window ending now. */
export function sinceForWindow(hours: number): string {
  return String(Math.floor(Date.now() / 1000) - hours * 3600);
}

export const WINDOWS = [
  { label: "Last hour", hours: 1 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
] as const;
