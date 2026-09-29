import { describe, expect, it } from "vitest";
import { isValidReleaseDate, releaseLabel, sortByRelease, splitByAge } from "./models";

const NOW = new Date(2026, 8, 29); // 2026-09-29
const ids = (models: { id: string }[]) => models.map((model) => model.id);

describe("isValidReleaseDate", () => {
  it.each(["1970-01-01", "2024-02-29", "2024-08-06", "9999-12-31"])("accepts %s", (date) => {
    expect(isValidReleaseDate(date)).toBe(true);
  });

  it.each([
    "",
    "2024-8-06",
    "2024/08/06",
    "2024-08-06T00:00:00Z",
    " 2024-08-06",
    "2024-00-10",
    "2024-13-01",
    "2024-04-31",
    "2023-02-29",
    "1969-12-31",
    "2024-05-00",
  ])("rejects %j", (date) => {
    expect(isValidReleaseDate(date)).toBe(false);
  });
});

describe("sortByRelease", () => {
  it("puts the newest first and undated models last in config order", () => {
    const models = [
      { id: "undated-a" },
      { id: "old", release_date: "2023-01-10" },
      { id: "undated-b" },
      { id: "new", release_date: "2026-08-07" },
      { id: "mid", release_date: "2024-08-06" },
    ];
    expect(ids(sortByRelease(models))).toEqual(["new", "mid", "old", "undated-a", "undated-b"]);
  });
});

describe("splitByAge", () => {
  it("folds nothing in a list of three or fewer", () => {
    const models = [
      { id: "a", release_date: "2020-01-01" },
      { id: "b", release_date: "2021-01-01" },
      { id: "c", release_date: "2022-01-01" },
    ];
    const { recent, older } = splitByAge(models, NOW);
    expect(ids(recent)).toEqual(["c", "b", "a"]);
    expect(older).toEqual([]);
  });

  it("folds models released over a year ago", () => {
    const models = [
      { id: "old-1", release_date: "2024-01-01" },
      { id: "new-1", release_date: "2026-09-01" },
      { id: "new-2", release_date: "2026-01-01" },
      { id: "undated" },
      { id: "old-2", release_date: "2025-09-28" },
      { id: "edge", release_date: "2025-09-29" },
    ];
    const { sorted, recent, older } = splitByAge(models, NOW);
    expect(ids(sorted)).toEqual(["new-1", "new-2", "edge", "old-2", "old-1", "undated"]);
    expect(ids(recent)).toEqual(["new-1", "new-2", "edge", "undated"]);
    expect(ids(older)).toEqual(["old-2", "old-1"]);
  });

  it("keeps the newest old models visible to show at least three", () => {
    const models = [
      { id: "a", release_date: "2020-01-01" },
      { id: "b", release_date: "2024-01-01" },
      { id: "c", release_date: "2023-01-01" },
      { id: "d", release_date: "2026-06-01" },
      { id: "e", release_date: "2022-01-01" },
    ];
    const { recent, older } = splitByAge(models, NOW);
    expect(ids(recent)).toEqual(["d", "b", "c"]);
    expect(ids(older)).toEqual(["e", "a"]);
  });

  it("never folds undated models", () => {
    const models: { id: string; release_date?: string }[] = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
    ];
    expect(splitByAge(models, NOW).older).toEqual([]);
  });
});

describe("releaseLabel", () => {
  it("formats the calendar date", () => {
    expect(releaseLabel("2024-08-06")).toBe("Aug 6, 2024");
  });
});
