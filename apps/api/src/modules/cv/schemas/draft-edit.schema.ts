import { z } from 'zod';
import { cvDraftSchema } from '../generation/draft.schema.js';

/**
 * Body of `PUT /cvs/:id/draft`: the whole draft plus the revision it is based on.
 *
 * The draft shape and caps are exactly the generated draft's (`cvDraftSchema`); the editor never
 * has a model of its own. On top of that, only what a person can break by hand:
 *  - entry ids are unique across experience and education (the client generates ids for new
 *    entries, and clarification questions refer to entries by id);
 *  - an email, when set, is a syntactically valid address.
 * Blank strings are rejected by the draft schema, so an emptied field is sent as `null`.
 */
export const cvDraftEditBodySchema = z
  .object({
    revision: z.number().int().nonnegative(),
    draft: cvDraftSchema,
  })
  .check((context) => {
    const { draft } = context.value;

    const seen = new Set<string>();
    const entries = [
      ...draft.experience.map((entry, index) => ({ id: entry.id, path: ['draft', 'experience', index, 'id'] })),
      ...draft.education.map((entry, index) => ({ id: entry.id, path: ['draft', 'education', index, 'id'] })),
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
