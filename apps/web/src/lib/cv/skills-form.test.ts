import { describe, expect, it } from "vitest";
import type { SkillCategoryFormEntry } from "./draft-form";
import {
  MAX_CATEGORIES,
  MAX_SKILLS_TOTAL,
  MAX_SKILL_LENGTH,
  addCategory,
  addSkill,
  canMoveCategory,
  categoryRefusalMessage,
  moveCategory,
  needsMoreSkills,
  refusalMessage,
  removeCategory,
  removeSkill,
  renameCategory,
  skillCount,
  suggestionStates,
} from "./skills-form";

const category = (id: string, name: string, skills: string[]): SkillCategoryFormEntry => ({
  id,
  name,
  skills: skills.map((value) => ({ value })),
});

const base = (): SkillCategoryFormEntry[] => [
  category("a", "Programming Languages", ["TypeScript"]),
  category("b", "Frameworks", ["React", "Node.js"]),
  category("c", "Databases", []),
];

const names = (categories: SkillCategoryFormEntry[]) => categories.map((entry) => entry.name);
const values = (entry: SkillCategoryFormEntry | undefined) => entry?.skills.map((item) => item.value);

describe("addSkill", () => {
  it("adds a trimmed skill to the chosen category and leaves the others alone", () => {
    const result = addSkill(base(), "c", "  PostgreSQL  ");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(values(result.categories[2])).toEqual(["PostgreSQL"]);
      expect(values(result.categories[0])).toEqual(["TypeScript"]);
    }
  });

  it("does not change the list it was given", () => {
    const categories = base();
    addSkill(categories, "c", "SQL");
    expect(values(categories[2])).toEqual([]);
  });

  it("refuses a blank skill", () => {
    expect(addSkill(base(), "a", "   ")).toEqual({ ok: false, refusal: { reason: "blank" } });
  });

  it("refuses a skill over the length limit and accepts exactly the limit", () => {
    expect(addSkill(base(), "a", "x".repeat(MAX_SKILL_LENGTH + 1))).toEqual({
      ok: false,
      refusal: { reason: "too_long", max: MAX_SKILL_LENGTH },
    });
    expect(addSkill(base(), "a", "x".repeat(MAX_SKILL_LENGTH)).ok).toBe(true);
  });

  it("refuses a duplicate in the same category, ignoring case", () => {
    expect(addSkill(base(), "a", "typescript")).toEqual({
      ok: false,
      refusal: { reason: "duplicate", category: "Programming Languages", sameCategory: true },
    });
  });

  it("refuses a skill already listed in another category, naming that category", () => {
    expect(addSkill(base(), "c", "React")).toEqual({
      ok: false,
      refusal: { reason: "duplicate", category: "Frameworks", sameCategory: false },
    });
  });

  it("refuses more than the total limit, even for a duplicate (the limit is reported first)", () => {
    const full = [category("a", "Full", Array.from({ length: MAX_SKILLS_TOTAL }, (_, index) => `skill ${index}`))];

    expect(addSkill(full, "a", "skill 0")).toEqual({ ok: false, refusal: { reason: "limit", max: MAX_SKILLS_TOTAL } });
    expect(addSkill(full, "a", "another")).toEqual({ ok: false, refusal: { reason: "limit", max: MAX_SKILLS_TOTAL } });
  });

  it("refuses an unknown category", () => {
    expect(addSkill(base(), "missing", "Go")).toEqual({ ok: false, refusal: { reason: "no_category" } });
  });
});

describe("refusalMessage", () => {
  it("says what to do, in words and not by colour", () => {
    expect(refusalMessage({ reason: "blank" }, "")).toBe("Enter a skill before adding it.");
    expect(refusalMessage({ reason: "too_long", max: 60 }, "x")).toBe("Shorten this skill to 60 characters or fewer.");
    expect(refusalMessage({ reason: "limit", max: 60 }, "x")).toBe(
      "Skill limit reached. Remove a skill before adding another.",
    );
    expect(refusalMessage({ reason: "no_category" }, "x")).toBe("Choose a category first.");
  });

  it("names the category only when the duplicate is in another one", () => {
    expect(
      refusalMessage({ reason: "duplicate", category: "Frameworks", sameCategory: true }, "React"),
    ).toBe("React is already added in this category.");
    expect(
      refusalMessage({ reason: "duplicate", category: "Frameworks", sameCategory: false }, "React"),
    ).toBe("React is already added in Frameworks.");
  });
});

describe("removeSkill", () => {
  it("removes one skill and keeps the category, even when it becomes empty", () => {
    const result = removeSkill(base(), "a", 0);

    expect(values(result[0])).toEqual([]);
    expect(names(result)).toEqual(names(base()));
  });

  it("ignores an index that does not exist", () => {
    expect(removeSkill(base(), "a", 5)).toEqual(base());
  });
});

describe("addCategory", () => {
  it("appends an empty category with the trimmed name and returns its id", () => {
    const result = addCategory(base(), "  Cloud & Infrastructure ", "new-id");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.created).toBe(true);
      expect(result.id).toBe("new-id");
      expect(names(result.categories)).toEqual([...names(base()), "Cloud & Infrastructure"]);
      expect(values(result.categories[3])).toEqual([]);
    }
  });

  it("selects the existing category instead of creating a second one with the same name, ignoring case", () => {
    const result = addCategory(base(), "frameworks", "new-id");

    expect(result).toEqual({ ok: true, categories: base(), id: "b", created: false });
  });

  it("refuses a blank or too long name", () => {
    expect(addCategory(base(), "  ", "x")).toEqual({ ok: false, refusal: { reason: "blank" } });
    expect(addCategory(base(), "y".repeat(61), "x")).toEqual({ ok: false, refusal: { reason: "too_long", max: 60 } });
  });

  it("refuses a thirteenth category", () => {
    const twelve = Array.from({ length: MAX_CATEGORIES }, (_, index) => category(`id${index}`, `Name ${index}`, []));

    expect(addCategory(twelve, "One more", "x")).toEqual({ ok: false, refusal: { reason: "limit", max: MAX_CATEGORIES } });
    expect(addCategory(twelve, "name 3", "x").ok).toBe(true);
  });
});

describe("renameCategory", () => {
  it("renames one category and keeps its skills and place", () => {
    const result = renameCategory(base(), "c", "  Cloud & Infrastructure ");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(names(result.categories)).toEqual(["Programming Languages", "Frameworks", "Cloud & Infrastructure"]);
    }
  });

  it("allows keeping the same name in another case", () => {
    expect(renameCategory(base(), "b", "FRAMEWORKS").ok).toBe(true);
  });

  it("refuses a name another category has, naming it, and a blank or too long name", () => {
    expect(renameCategory(base(), "c", "frameworks")).toEqual({
      ok: false,
      refusal: { reason: "taken", category: "Frameworks" },
    });
    expect(renameCategory(base(), "c", " ")).toEqual({ ok: false, refusal: { reason: "blank" } });
    expect(renameCategory(base(), "c", "y".repeat(61))).toEqual({ ok: false, refusal: { reason: "too_long", max: 60 } });
  });

  it("explains a taken name in words", () => {
    expect(categoryRefusalMessage({ reason: "taken", category: "Frameworks" })).toBe(
      "Frameworks is already a category in this CV.",
    );
  });
});

describe("categoryRefusalMessage", () => {
  it("explains each refusal in words", () => {
    expect(categoryRefusalMessage({ reason: "blank" })).toBe("Choose or enter a category name.");
    expect(categoryRefusalMessage({ reason: "too_long", max: 60 })).toBe(
      "Keep the category name to 60 characters or fewer.",
    );
    expect(categoryRefusalMessage({ reason: "limit", max: 12 })).toBe(
      "A CV can have at most 12 skill categories. Remove one to add another.",
    );
  });
});

describe("removeCategory and moveCategory", () => {
  it("removes a category with its skills", () => {
    const result = removeCategory(base(), "b");

    expect(names(result)).toEqual(["Programming Languages", "Databases"]);
    expect(skillCount(result)).toBe(1);
  });

  it("swaps a category with its neighbour", () => {
    expect(names(moveCategory(base(), "b", -1))).toEqual(["Frameworks", "Programming Languages", "Databases"]);
    expect(names(moveCategory(base(), "b", 1))).toEqual(["Programming Languages", "Databases", "Frameworks"]);
  });

  it("does not move the first category up or the last one down", () => {
    expect(names(moveCategory(base(), "a", -1))).toEqual(names(base()));
    expect(names(moveCategory(base(), "c", 1))).toEqual(names(base()));
  });

  it("says which moves are possible, for disabling the buttons", () => {
    expect(canMoveCategory(0, -1, 3)).toBe(false);
    expect(canMoveCategory(0, 1, 3)).toBe(true);
    expect(canMoveCategory(2, 1, 3)).toBe(false);
    expect(canMoveCategory(2, -1, 3)).toBe(true);
    expect(canMoveCategory(0, 1, 1)).toBe(false);
  });
});

describe("counts and suggestions", () => {
  it("counts only non-blank skills across all categories", () => {
    const categories = [...base(), category("d", "Other", ["", "  ", "Go"])];

    expect(skillCount(categories)).toBe(4);
  });

  it("suggests adding at least five skills, without ever blocking", () => {
    expect(needsMoreSkills(0)).toBe(true);
    expect(needsMoreSkills(4)).toBe(true);
    expect(needsMoreSkills(5)).toBe(false);
  });

  it("marks the suggestions already in the CV, ignoring case, wherever they are", () => {
    const states = suggestionStates(["Python", "react", "Go"], base());

    expect(states).toEqual([
      { skill: "Python", added: false },
      { skill: "react", added: true },
      { skill: "Go", added: false },
    ]);
  });
});
