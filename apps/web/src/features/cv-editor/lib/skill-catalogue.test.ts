import { describe, expect, it } from "vitest";
import {
  SKILL_CATALOGUE,
  isPredefinedCategory,
  parseSkillCatalogue,
  suggestionsFor,
} from "./skill-catalogue";

describe("skill catalogue (shared file)", () => {
  it("has unique category names, ignoring case, each 1 to 60 characters", () => {
    const lowered = SKILL_CATALOGUE.map((entry) => entry.name.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
    for (const { name } of SKILL_CATALOGUE) {
      expect(name).toBe(name.trim());
      expect(name.length).toBeGreaterThanOrEqual(1);
      expect(name.length).toBeLessThanOrEqual(60);
    }
  });

  it("gives every category 4 to 6 unique suggestions of 1 to 60 characters", () => {
    for (const { name, suggestions } of SKILL_CATALOGUE) {
      expect(suggestions.length, name).toBeGreaterThanOrEqual(4);
      expect(suggestions.length, name).toBeLessThanOrEqual(6);
      const lowered = suggestions.map((suggestion) => suggestion.toLowerCase());
      expect(new Set(lowered).size, name).toBe(lowered.length);
      for (const suggestion of suggestions) {
        expect(suggestion.length).toBeGreaterThanOrEqual(1);
        expect(suggestion.length).toBeLessThanOrEqual(60);
      }
    }
  });

  it("keeps the catalogue order", () => {
    expect(SKILL_CATALOGUE[0]?.name).toBe("Programming Languages");
  });
});

describe("suggestionsFor and isPredefinedCategory", () => {
  it("find a category regardless of letter case and surrounding spaces", () => {
    expect(suggestionsFor("frameworks")).toEqual(SKILL_CATALOGUE.find((entry) => entry.name === "Frameworks")?.suggestions);
    expect(isPredefinedCategory("  DATABASES ")).toBe(true);
  });

  it("treat a custom or empty name as not predefined, with no suggestions", () => {
    expect(isPredefinedCategory("My own category")).toBe(false);
    expect(suggestionsFor("My own category")).toEqual([]);
    expect(suggestionsFor("")).toEqual([]);
  });
});

describe("parseSkillCatalogue", () => {
  const valid = [{ name: "A", suggestions: ["a1", "a2", "a3", "a4"] }];

  it("accepts a well-formed catalogue", () => {
    expect(parseSkillCatalogue(valid)).toEqual(valid);
  });

  it.each([
    ["not an array", {}],
    ["an empty catalogue", []],
    ["a missing suggestions list", [{ name: "A" }]],
    ["fewer than 4 suggestions", [{ name: "A", suggestions: ["a1", "a2", "a3"] }]],
    ["more than 6 suggestions", [{ name: "A", suggestions: ["1", "2", "3", "4", "5", "6", "7"] }]],
    ["an empty name", [{ name: "", suggestions: ["a1", "a2", "a3", "a4"] }]],
    ["duplicate names ignoring case", [...valid, { name: "a", suggestions: ["b1", "b2", "b3", "b4"] }]],
    ["duplicate suggestions in one category", [{ name: "A", suggestions: ["x", "X", "y", "z"] }]],
    ["a name that collides with the fallback", [{ name: "skills", suggestions: ["a1", "a2", "a3", "a4"] }]],
  ])("fails fast for %s", (_label, input) => {
    expect(() => parseSkillCatalogue(input)).toThrow();
  });
});
