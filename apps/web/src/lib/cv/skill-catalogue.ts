import catalogue from "@ai-cv-builder/skill-catalogue";
import { z } from "zod";

// The predefined skill categories and their suggested skills, read from the shared catalogue file
// (`packages/skill-catalogue/skill-categories.json`), the only place the list is written down. The
// API reads the same file for the category names. The file is data, so it is parsed here: a
// malformed catalogue fails the build/start instead of rendering a broken combobox.

/** The category new skills fall back to; the API uses the same name and the catalogue never lists it. */
const FALLBACK_CATEGORY = "Skills";

const text = z.string().trim().min(1).max(60);

const catalogueSchema = z
  .array(z.object({ name: text, suggestions: z.array(text).min(4).max(6) }))
  .min(1)
  .superRefine((entries, context) => {
    const names = new Set<string>([FALLBACK_CATEGORY.toLowerCase()]);
    entries.forEach((entry, index) => {
      const key = entry.name.toLowerCase();
      if (names.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Category names must be unique and must not repeat the fallback",
          path: [index, "name"],
        });
      }
      names.add(key);

      const suggestions = new Set<string>();
      for (const suggestion of entry.suggestions) {
        const suggestionKey = suggestion.toLowerCase();
        if (suggestions.has(suggestionKey)) {
          context.addIssue({
            code: "custom",
            message: "Suggestions must be unique within a category",
            path: [index, "suggestions"],
          });
        }
        suggestions.add(suggestionKey);
      }
    });
  });

export interface SkillCategoryEntry {
  name: string;
  suggestions: string[];
}

/** Exported for tests: validates a catalogue value. */
export function parseSkillCatalogue(input: unknown): SkillCategoryEntry[] {
  return catalogueSchema.parse(input);
}

export const SKILL_CATALOGUE: readonly SkillCategoryEntry[] = parseSkillCatalogue(catalogue);

const byName = new Map(SKILL_CATALOGUE.map((entry) => [entry.name.toLowerCase(), entry]));

function find(name: string): SkillCategoryEntry | undefined {
  return byName.get(name.trim().toLowerCase());
}

/** The suggested skills of a predefined category; empty for a custom or unknown name. */
export function suggestionsFor(name: string): readonly string[] {
  return find(name)?.suggestions ?? [];
}

/** Whether a category name is one of the predefined categories (case-insensitive). */
export function isPredefinedCategory(name: string): boolean {
  return find(name) !== undefined;
}
