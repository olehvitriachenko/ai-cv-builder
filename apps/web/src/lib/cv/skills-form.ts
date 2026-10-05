import type { SkillCategoryFormEntry } from "./draft-form";

// The rules of the Skills card as pure functions over the form's `skillCategories`: what adding a
// skill or a category does and when it is refused, ordering, and what the card suggests. They
// mirror the server's write rules (a skill once in the whole CV, 60 characters, 60 skills, 12
// categories) so a refusal is explained on the field instead of being a failed save. Nothing here
// mutates its input.

export const MAX_SKILL_LENGTH = 60;
export const MAX_SKILLS_TOTAL = 60;
export const MAX_CATEGORIES = 12;
export const MAX_CATEGORY_NAME_LENGTH = 60;
/** "It is suggested to add at least 5 skills": advice only, it never blocks saving. */
export const SUGGESTED_MINIMUM = 5;

export type SkillRefusal =
  | { reason: "blank" }
  | { reason: "too_long"; max: number }
  | { reason: "limit"; max: number }
  | { reason: "duplicate"; category: string; sameCategory: boolean }
  | { reason: "no_category" };

export type SkillResult =
  | { ok: true; categories: SkillCategoryFormEntry[] }
  | { ok: false; refusal: SkillRefusal };

export type CategoryRefusal = { reason: "blank" } | { reason: "too_long"; max: number } | { reason: "limit"; max: number };

export type CategoryResult =
  | { ok: true; categories: SkillCategoryFormEntry[]; id: string; created: boolean }
  | { ok: false; refusal: CategoryRefusal };

const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function heldSkills(entry: SkillCategoryFormEntry): string[] {
  return entry.skills.map((item) => item.value.trim()).filter((value) => value !== "");
}

/** How many skills the CV holds, blanks ignored. */
export function skillCount(categories: readonly SkillCategoryFormEntry[]): number {
  return categories.reduce((count, entry) => count + heldSkills(entry).length, 0);
}

export const needsMoreSkills = (total: number): boolean => total < SUGGESTED_MINIMUM;

/**
 * Adds a skill to a category. The checks run in the order the person would fix them: blank, too
 * long, the CV's skill limit (reported before a duplicate, as in the design), then a duplicate
 * anywhere in the CV (the server allows a skill once).
 */
export function addSkill(categories: readonly SkillCategoryFormEntry[], categoryId: string, input: string): SkillResult {
  const target = categories.find((entry) => entry.id === categoryId);
  if (target === undefined) {
    return { ok: false, refusal: { reason: "no_category" } };
  }
  const skill = input.trim();
  if (skill === "") {
    return { ok: false, refusal: { reason: "blank" } };
  }
  if (skill.length > MAX_SKILL_LENGTH) {
    return { ok: false, refusal: { reason: "too_long", max: MAX_SKILL_LENGTH } };
  }
  if (skillCount(categories) >= MAX_SKILLS_TOTAL) {
    return { ok: false, refusal: { reason: "limit", max: MAX_SKILLS_TOTAL } };
  }
  const holder = categories.find((entry) => heldSkills(entry).some((held) => sameText(held, skill)));
  if (holder !== undefined) {
    return { ok: false, refusal: { reason: "duplicate", category: holder.name, sameCategory: holder.id === categoryId } };
  }
  return {
    ok: true,
    categories: categories.map((entry) =>
      entry.id === categoryId ? { ...entry, skills: [...entry.skills, { value: skill }] } : entry,
    ),
  };
}

/** The sentence shown on the field for a refusal. */
export function refusalMessage(refusal: SkillRefusal, skill: string): string {
  switch (refusal.reason) {
    case "blank":
      return "Enter a skill before adding it.";
    case "too_long":
      return `Shorten this skill to ${refusal.max} characters or fewer.`;
    case "limit":
      return "Skill limit reached. Remove a skill before adding another.";
    case "duplicate":
      return refusal.sameCategory
        ? `${skill.trim()} is already added in this category.`
        : `${skill.trim()} is already added in ${refusal.category}.`;
    case "no_category":
      return "Choose a category first.";
  }
}

/** The sentence shown under the category field when a category cannot be chosen. */
export function categoryRefusalMessage(refusal: CategoryRefusal): string {
  switch (refusal.reason) {
    case "blank":
      return "Choose or enter a category name.";
    case "too_long":
      return `Keep the category name to ${refusal.max} characters or fewer.`;
    case "limit":
      return `A CV can have at most ${refusal.max} skill categories. Remove one to add another.`;
  }
}

/** Removes one skill; the category stays even when it becomes empty (empty ones are not saved). */
export function removeSkill(
  categories: readonly SkillCategoryFormEntry[],
  categoryId: string,
  index: number,
): SkillCategoryFormEntry[] {
  return categories.map((entry) =>
    entry.id === categoryId ? { ...entry, skills: entry.skills.filter((_, position) => position !== index) } : entry,
  );
}

/**
 * Chooses a category by name: an existing one (any case) is selected as it is, otherwise an empty
 * category is appended. Predefined and custom names go through the same path.
 */
export function addCategory(
  categories: readonly SkillCategoryFormEntry[],
  name: string,
  id: string = globalThis.crypto.randomUUID(),
): CategoryResult {
  const trimmed = name.trim();
  if (trimmed === "") {
    return { ok: false, refusal: { reason: "blank" } };
  }
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) {
    return { ok: false, refusal: { reason: "too_long", max: MAX_CATEGORY_NAME_LENGTH } };
  }
  const existing = categories.find((entry) => sameText(entry.name, trimmed));
  if (existing !== undefined) {
    return { ok: true, categories: [...categories], id: existing.id, created: false };
  }
  if (categories.length >= MAX_CATEGORIES) {
    return { ok: false, refusal: { reason: "limit", max: MAX_CATEGORIES } };
  }
  return { ok: true, categories: [...categories, { id, name: trimmed, skills: [] }], id, created: true };
}

export function removeCategory(categories: readonly SkillCategoryFormEntry[], categoryId: string): SkillCategoryFormEntry[] {
  return categories.filter((entry) => entry.id !== categoryId);
}

/** Whether a category at `index` can move by `delta` (-1 up, 1 down): the first cannot go up, the last cannot go down. */
export function canMoveCategory(index: number, delta: -1 | 1, count: number): boolean {
  const target = index + delta;
  return target >= 0 && target < count;
}

/** Swaps a category with its neighbour; at either end it stays where it is. */
export function moveCategory(
  categories: readonly SkillCategoryFormEntry[],
  categoryId: string,
  delta: -1 | 1,
): SkillCategoryFormEntry[] {
  const index = categories.findIndex((entry) => entry.id === categoryId);
  if (index === -1 || !canMoveCategory(index, delta, categories.length)) {
    return [...categories];
  }
  const next = [...categories];
  const [moved] = next.splice(index, 1);
  if (moved !== undefined) {
    next.splice(index + delta, 0, moved);
  }
  return next;
}

export interface SuggestionState {
  skill: string;
  /** Already in the CV (in any category): shown as disabled with a check. */
  added: boolean;
}

/** The suggestion chips of a category with their state; suggestions are only ever added by a tap. */
export function suggestionStates(
  suggestions: readonly string[],
  categories: readonly SkillCategoryFormEntry[],
): SuggestionState[] {
  const held = categories.flatMap(heldSkills);
  return suggestions.map((skill) => ({ skill, added: held.some((value) => sameText(value, skill)) }));
}
