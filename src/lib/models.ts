import { format, parseISO, subYears } from "date-fns";

/**
 * Model release dates (lumen v0.6.1, PR #161): an optional per-model
 * `release_date = "YYYY-MM-DD"`, returned by `GET /v1/models` and kept in
 * the config. Model lists show the newest first and fold the ones released
 * over a year ago behind a toggle.
 */
export interface Dated {
  release_date?: string;
}

/** Lists this short never fold anything. */
export const ALWAYS_SHOWN = 3;

/**
 * Same rule as lumen's `ReleaseDate`: exactly `YYYY-MM-DD`, a real calendar
 * date, between 1970-01-01 and 9999-12-31.
 */
export function isValidReleaseDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1970) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Newest first; undated models last, keeping their config order. */
export function sortByRelease<T extends Dated>(models: readonly T[]): T[] {
  return [...models].sort((a, b) => {
    if (a.release_date && b.release_date) return b.release_date.localeCompare(a.release_date);
    if (a.release_date) return -1;
    if (b.release_date) return 1;
    return 0;
  });
}

/**
 * Sorts `models` and splits off those released over a year before `now`.
 * Nothing is folded in a list of {@link ALWAYS_SHOWN} or fewer, at least
 * that many stay visible (the newest of the old ones fill in), and undated
 * models are never folded since their age is unknown.
 */
export function splitByAge<T extends Dated>(
  models: readonly T[],
  now: Date = new Date(),
): { sorted: T[]; recent: T[]; older: T[] } {
  const sorted = sortByRelease(models);
  if (sorted.length <= ALWAYS_SHOWN) return { sorted, recent: sorted, older: [] };
  const cutoff = format(subYears(now, 1), "yyyy-MM-dd");
  const old = new Set(sorted.filter((model) => model.release_date && model.release_date < cutoff));
  // Sorted order puts the newest old models first: promote those.
  let missing = ALWAYS_SHOWN - (sorted.length - old.size);
  for (const model of old) {
    if (missing <= 0) break;
    old.delete(model);
    missing -= 1;
  }
  return {
    sorted,
    recent: sorted.filter((model) => !old.has(model)),
    older: sorted.filter((model) => old.has(model)),
  };
}

/** "Aug 6, 2024", read as a calendar date (no timezone shift). */
export function releaseLabel(date: string): string {
  return format(parseISO(date), "MMM d, yyyy");
}
