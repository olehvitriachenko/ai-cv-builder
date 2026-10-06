import catalogue from '@ai-cv-builder/skill-catalogue' with { type: 'json' };
import { z } from 'zod';

/**
 * The predefined skill category names, read from the shared catalogue file
 * (`packages/skill-catalogue/skill-categories.json`), the only place the list is written down. The
 * API needs the names only (the model's closed set of categories); the suggestions are the web
 * app's concern. The file is data, so it is parsed here: a malformed catalogue fails at startup
 * instead of reaching a prompt.
 */

/** Where a skill goes when no predefined category fits. Not listed in the catalogue itself. */
export const FALLBACK_SKILL_CATEGORY = 'Skills';

const categoryName = z.string().trim().min(1).max(60);

const catalogueNamesSchema = z
  .array(z.object({ name: categoryName }))
  .min(1)
  .superRefine((entries, context) => {
    const seen = new Set<string>([FALLBACK_SKILL_CATEGORY.toLowerCase()]);
    entries.forEach((entry, index) => {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          message: 'Category names must be unique and must not repeat the fallback',
          path: [index, 'name'],
        });
      }
      seen.add(key);
    });
  });

/** Exported for tests: validates a catalogue value and returns its names in order. */
export function parseSkillCategoryNames(input: unknown): string[] {
  return catalogueNamesSchema.parse(input).map((entry) => entry.name);
}

const names = parseSkillCategoryNames(catalogue);
const [firstName, ...otherNames] = names;
if (firstName === undefined) {
  throw new Error('The skill catalogue has no categories');
}

/** Non-empty tuple, so it can feed `z.enum` directly. */
export const SKILL_CATEGORY_NAMES: readonly [string, ...string[]] = [firstName, ...otherNames];

const canonicalByKey = new Map(
  [...names, FALLBACK_SKILL_CATEGORY].map((name) => [name.toLowerCase(), name]),
);

/** The catalogue spelling of a category name (or the fallback), ignoring case and surrounding spaces. */
export function canonicalSkillCategoryName(name: string): string | undefined {
  return canonicalByKey.get(name.trim().toLowerCase());
}

/** Whether a category name is a catalogue name or the fallback (case-insensitive). */
export function isKnownSkillCategory(name: string): boolean {
  return canonicalSkillCategoryName(name) !== undefined;
}
