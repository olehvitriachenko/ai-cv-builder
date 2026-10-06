import { z } from 'zod';
import { cvDraftSchema } from '../generation/draft.schema.js';
import { targetRoleSchema } from './cv.schemas.js';

/**
 * Body of `PUT /cvs/:id/draft`: the whole draft, the revision it is based on and, optionally, the
 * target role (stored with the CV, not in the draft; absent means unchanged).
 *
 * The draft shape and caps are exactly the generated draft's (`cvDraftSchema`); the editor never
 * has a model of its own. On top of that, only what a person can break by hand:
 *  - entry ids are unique across experience and education (the client generates ids for new
 *    entries, and clarification questions refer to entries by id);
 *  - an email, when set, is a syntactically valid address;
 *  - skill category ids and names (ignoring case) are unique, skills are unique across the whole CV
 *    (ignoring case), and no category is empty.
 * Blank strings are rejected by the draft schema, so an emptied field is sent as `null`.
 */
export const cvDraftEditBodySchema = z
  .object({
    revision: z.number().int().nonnegative(),
    draft: cvDraftSchema,
    targetRole: targetRoleSchema.optional(),
  })
  .check((context) => {
    const { draft } = context.value;

    const seen = new Set<string>();
    const entries = [
      ...draft.experience.map((entry, index) => ({
        id: entry.id,
        path: ['draft', 'experience', index, 'id'],
      })),
      ...draft.education.map((entry, index) => ({
        id: entry.id,
        path: ['draft', 'education', index, 'id'],
      })),
    ];
    for (const entry of entries) {
      if (seen.has(entry.id)) {
        context.issues.push({
          code: 'custom',
          message: 'Entry ids must be unique',
          path: entry.path,
          input: entry.id,
        });
      }
      seen.add(entry.id);
    }

    const categoryIds = new Set<string>();
    const categoryNames = new Set<string>();
    const skills = new Set<string>();
    draft.skillCategories.forEach((category, categoryIndex) => {
      const base = ['draft', 'skillCategories', categoryIndex];
      if (categoryIds.has(category.id)) {
        context.issues.push({
          code: 'custom',
          message: 'Category ids must be unique',
          path: [...base, 'id'],
          input: category.id,
        });
      }
      categoryIds.add(category.id);

      const nameKey = category.name.toLowerCase();
      if (categoryNames.has(nameKey)) {
        context.issues.push({
          code: 'custom',
          message: 'Category names must be unique',
          path: [...base, 'name'],
          input: category.name,
        });
      }
      categoryNames.add(nameKey);

      if (category.skills.length === 0) {
        context.issues.push({
          code: 'custom',
          message: 'A category needs at least one skill',
          path: [...base, 'skills'],
          input: category.skills,
        });
      }
      category.skills.forEach((skill, skillIndex) => {
        const skillKey = skill.toLowerCase();
        if (skills.has(skillKey)) {
          context.issues.push({
            code: 'custom',
            message: 'A skill can appear only once',
            path: [...base, 'skills', skillIndex],
            input: skill,
          });
        }
        skills.add(skillKey);
      });
    });

    const email = draft.contact.email;
    if (email !== null && !z.email().safeParse(email).success) {
      context.issues.push({
        code: 'custom',
        message: 'Enter a valid email address',
        path: ['draft', 'contact', 'email'],
        input: email,
      });
    }
  });

export type CvDraftEditBody = z.output<typeof cvDraftEditBodySchema>;
