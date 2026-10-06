import { describe, expect, it } from "vitest";
import { customCategoryOption, filterCategories, nextActiveIndex } from "./category-filter";

const NAMES = ["Programming Languages", "Frameworks", "Databases", "Cloud & Infrastructure", "Cloud Security"];

describe("filterCategories", () => {
  it("keeps every name, in order, for an empty or blank query", () => {
    expect(filterCategories("", NAMES)).toEqual(NAMES);
    expect(filterCategories("   ", NAMES)).toEqual(NAMES);
  });

  it("matches a substring, ignoring case, and keeps the source order", () => {
    expect(filterCategories("cLoUd", NAMES)).toEqual(["Cloud & Infrastructure", "Cloud Security"]);
    expect(filterCategories("base", NAMES)).toEqual(["Databases"]);
  });

  it("returns nothing when no name matches", () => {
    expect(filterCategories("Observability", NAMES)).toEqual([]);
  });
});

describe("customCategoryOption", () => {
  it("offers the typed text when it is not blank and matches no name exactly", () => {
    expect(customCategoryOption("  Observability ", NAMES)).toBe("Observability");
  });

  it("does not offer a custom category for an exact match, ignoring case, or for blank text", () => {
    expect(customCategoryOption("frameworks", NAMES)).toBeNull();
    expect(customCategoryOption("", NAMES)).toBeNull();
    expect(customCategoryOption("   ", NAMES)).toBeNull();
  });

  it("still offers it when the text only partly matches a name", () => {
    expect(customCategoryOption("Cloud", NAMES)).toBe("Cloud");
  });

  it("does not offer a name that is too long to save", () => {
    expect(customCategoryOption("x".repeat(61), NAMES)).toBeNull();
    expect(customCategoryOption("x".repeat(60), NAMES)).toBe("x".repeat(60));
  });
});

describe("nextActiveIndex", () => {
  it("moves down and wraps to the first option", () => {
    expect(nextActiveIndex(0, "ArrowDown", 3)).toBe(1);
    expect(nextActiveIndex(2, "ArrowDown", 3)).toBe(0);
  });

  it("moves up and wraps to the last option", () => {
    expect(nextActiveIndex(2, "ArrowUp", 3)).toBe(1);
    expect(nextActiveIndex(0, "ArrowUp", 3)).toBe(2);
  });

  it("goes to the first and the last option with Home and End", () => {
    expect(nextActiveIndex(1, "Home", 3)).toBe(0);
    expect(nextActiveIndex(1, "End", 3)).toBe(2);
  });

  it("starts from the first option going down and from the last going up when nothing is active", () => {
    expect(nextActiveIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextActiveIndex(-1, "ArrowUp", 3)).toBe(2);
  });

  it("has no active option when the list is empty", () => {
    expect(nextActiveIndex(-1, "ArrowDown", 0)).toBe(-1);
    expect(nextActiveIndex(0, "End", 0)).toBe(-1);
  });
});
