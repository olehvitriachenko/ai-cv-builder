import { randomUUID } from 'node:crypto';
import { canonicalSkillCategoryName } from '../../ai/catalogue/skill-categories.js';
import type { AnswerPatch } from '../../ai/schemas/answer-patch.schema.js';
import type { QuestionSectionName } from '../../ai/schemas/llm-cv-output.schema.js';
import {
  MAX_SKILL_CATEGORIES,
  MAX_SKILLS,
  cvDraftSchema,
  type CvDraft,
} from '../generation/draft.schema.js';
import { containsFact, supportsQuantities } from '../generation/explicit-facts.js';
import { indexSource, type SourceIndex } from '../generation/source-matching.js';

/**
 * Validates an AI-produced patch and applies it to one section or entry of a draft. Pure and
 * deterministic: the AI proposes values, this decides what may land.
 *
 *  - The target is chosen by the server (section + entry id); the patch cannot name another one.
 *  - Additive only: a scalar fills a null value, lists are appended to. A value that would replace
 *    something already there is an issue (`would_overwrite`), never an overwrite.
 *  - What the patch adds must be supported by the person's answer, with the same deterministic
 *    checks generation uses against its source: contact details, organisations, locations, dates,
 *    skills, and the numbers in new bullets, details and summaries (numbers may also come from the
 *    entry being extended). Only the additions are checked; what the CV already holds is not.
 *    Wording of bullets and summaries cannot be proven mechanically; that is governed by the prompt
 *    contract, as documented for generation.
 *  - A patch that changes nothing is rejected, so a question is only ever "applied" when the CV
 *    really changed.
 *  - The whole result must still satisfy the draft schema (caps, entry rules).
 *
 * Issues carry rule ids and JSON paths only, never draft or answer text.
 */
export interface PatchTarget {
  section: QuestionSectionName;
  itemId: string | null;
}

export interface PatchIssue {
  rule: string;
  path: string;
}

export type PatchResult = { ok: true; draft: CvDraft } | { ok: false; issues: PatchIssue[] };

const MAX_BULLETS = 12;
const MAX_LINKS = 5;

const trimmed = (value: string | null): string | null => {
  const result = value?.trim() ?? '';
  return result === '' ? null : result;
};

function cleanList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (item !== '' && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function finish(issues: PatchIssue[], changed: boolean, draft: CvDraft): PatchResult {
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (!changed) {
    return { ok: false, issues: [{ rule: 'empty_patch', path: 'patch' }] };
  }
  const parsed = cvDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        rule: `draft_${issue.code}`,
        path: issue.path.join('.'),
      })),
    };
  }
  return { ok: true, draft: parsed.data };
}

const fail = (rule: string, path: string): PatchResult => ({ ok: false, issues: [{ rule, path }] });

export function applyAnswerPatch(
  draft: CvDraft,
  target: PatchTarget,
  patch: AnswerPatch,
  answerText: string,
  newId: () => string = randomUUID,
): PatchResult {
  switch (target.section) {
    case 'CONTACT':
      return 'fullName' in patch
        ? applyContact(draft, patch, answerText)
        : fail('wrong_scope', 'patch');
    case 'SUMMARY':
      return 'summary' in patch ? applySummary(draft, patch, answerText) : fail('wrong_scope', 'patch');
    case 'SKILLS':
      return 'additions' in patch
        ? applySkills(draft, patch, answerText, newId)
        : fail('wrong_scope', 'patch');
    case 'EXPERIENCE':
      return 'bullets' in patch && 'employer' in patch
        ? applyExperience(draft, target.itemId, patch, answerText)
        : fail('wrong_scope', 'patch');
    case 'EDUCATION':
      return 'details' in patch && 'institution' in patch
        ? applyEducation(draft, target.itemId, patch, answerText)
        : fail('wrong_scope', 'patch');
  }
}

type ContactPatch = Extract<AnswerPatch, { fullName: string | null }>;

function applyContact(draft: CvDraft, patch: ContactPatch, answerText: string): PatchResult {
  const issues: PatchIssue[] = [];
  const source = indexSource(answerText);
  const contact = { ...draft.contact };
  let changed = false;

  const fullName = trimmed(patch.fullName);
  if (fullName !== null) {
    if (contact.fullName !== null) {
      issues.push({ rule: 'would_overwrite', path: 'patch.fullName' });
    } else if (!source.hasPersonName(fullName)) {
      issues.push({ rule: 'unsupported_name', path: 'patch.fullName' });
    } else {
      contact.fullName = fullName;
      changed = true;
    }
  }
  const email = trimmed(patch.email);
  if (email !== null) {
    if (contact.email !== null) {
      issues.push({ rule: 'would_overwrite', path: 'patch.email' });
    } else if (!source.hasEmail(email)) {
      issues.push({ rule: 'unsupported_contact', path: 'patch.email' });
    } else {
      contact.email = email;
      changed = true;
    }
  }
  const phone = trimmed(patch.phone);
  if (phone !== null) {
    if (contact.phone !== null) {
      issues.push({ rule: 'would_overwrite', path: 'patch.phone' });
    } else if (!source.hasPhone(phone)) {
      issues.push({ rule: 'unsupported_contact', path: 'patch.phone' });
    } else {
      contact.phone = phone;
      changed = true;
    }
  }
  const location = trimmed(patch.location);
  if (location !== null) {
    if (contact.location !== null) {
      issues.push({ rule: 'would_overwrite', path: 'patch.location' });
    } else if (!source.hasOrganisation(location)) {
      issues.push({ rule: 'unsupported_location', path: 'patch.location' });
    } else {
      contact.location = location;
      changed = true;
    }
  }

  const links = cleanList(patch.links);
  const added: string[] = [];
  links.forEach((link, index) => {
    if (contact.links.includes(link)) {
      return;
    }
    if (!source.hasLink(link)) {
      issues.push({ rule: 'unsupported_contact', path: `patch.links.${index}` });
      return;
    }
    added.push(link);
  });
  if (contact.links.length + added.length > MAX_LINKS) {
    issues.push({ rule: 'too_many_links', path: 'patch.links' });
  }
  if (added.length > 0) {
    contact.links = [...contact.links, ...added];
    changed = true;
  }

  return finish(issues, changed, { ...draft, contact });
}

function applySummary(
  draft: CvDraft,
  patch: { summary: string | null },
  answerText: string,
): PatchResult {
  if (draft.summary !== null) {
    // A present summary may be the person's own text: it is never rewritten.
    return fail('target_filled', 'target');
  }
  const summary = trimmed(patch.summary);
  if (summary !== null && !supportsQuantities(answerText, summary)) {
    return fail('unsupported_quantity', 'patch.summary');
  }
  return finish([], summary !== null, { ...draft, summary });
}

type SkillsPatch = Extract<AnswerPatch, { additions: unknown }>;

/**
 * Appends skills per category. A name matching an existing category (ignoring case) extends it; a
 * new category is created at the end only when its name is a predefined one or the fallback
 * `Skills`. Skills already present anywhere in the CV (ignoring case) are ignored. Nothing is
 * removed, renamed or reordered.
 */
function applySkills(
  draft: CvDraft,
  patch: SkillsPatch,
  answerText: string,
  newId: () => string,
): PatchResult {
  const issues: PatchIssue[] = [];
  const categories = draft.skillCategories.map((category) => ({
    ...category,
    skills: [...category.skills],
  }));
  const known = new Set(
    categories.flatMap((category) => category.skills.map((skill) => skill.toLowerCase())),
  );
  let added = 0;

  patch.additions.forEach((addition, index) => {
    const path = `patch.additions.${index}.category`;
    const name = addition.category.trim();
    if (name === '') {
      issues.push({ rule: 'blank_category', path });
      return;
    }

    let category = categories.find(
      (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
    );
    if (!category) {
      const canonical = canonicalSkillCategoryName(name);
      if (canonical === undefined) {
        issues.push({ rule: 'unknown_category', path });
        return;
      }
      category = categories.find(
        (candidate) => candidate.name.toLowerCase() === canonical.toLowerCase(),
      );
    }

    // A category is created lazily, only when it receives at least one new skill.
    let target = category;
    for (const skill of cleanList(addition.skills)) {
      const key = skill.toLowerCase();
      if (known.has(key)) {
        continue;
      }
      if (!containsFact(answerText, skill)) {
        issues.push({ rule: 'unsupported_skill', path: `patch.additions.${index}.skills` });
        continue;
      }
      if (!target) {
        const created = {
          id: newId(),
          name: canonicalSkillCategoryName(name) ?? name,
          skills: [] as string[],
        };
        categories.push(created);
        target = created;
      }
      known.add(key);
      target.skills.push(skill);
      added += 1;
    }
  });

  if (categories.length > MAX_SKILL_CATEGORIES) {
    issues.push({ rule: 'too_many_categories', path: 'patch.additions' });
  }
  if (categories.reduce((total, category) => total + category.skills.length, 0) > MAX_SKILLS) {
    issues.push({ rule: 'too_many_skills', path: 'patch.additions' });
  }
  return finish(issues, added > 0, { ...draft, skillCategories: categories });
}

/**
 * The rule a value the patch adds to an entry breaks, or null. Organisations and locations must be
 * named in the answer (or the entry), dates must be written in the answer, and numbers must come
 * from the answer or the entry being extended. Titles and qualifications are wording the prompt
 * governs, as in generation.
 */
function unsupportedEntryValue(
  key: string,
  value: string,
  source: SourceIndex,
  answerText: string,
  context: string,
): string | null {
  switch (key) {
    case 'employer':
    case 'institution':
      return source.hasOrganisation(value) ? null : 'unsupported_organisation';
    case 'location':
      return source.hasOrganisation(value) ? null : 'unsupported_location';
    case 'startDate':
    case 'endDate':
      return containsFact(answerText, value) ? null : 'unsupported_date';
    case 'details':
      return supportsQuantities(`${answerText}\n${context}`, value) ? null : 'unsupported_quantity';
    default:
      return null;
  }
}

/** The facts an entry already holds: numbers in an addition may restate them. */
function entryText(entry: Record<string, unknown>): string {
  return Object.values(entry)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

type ExperiencePatch = Extract<AnswerPatch, { bullets: string[]; employer: string | null }>;
const EXPERIENCE_KEYS = ['employer', 'title', 'location', 'startDate', 'endDate'] as const;

function applyExperience(
  draft: CvDraft,
  itemId: string | null,
  patch: ExperiencePatch,
  answerText: string,
): PatchResult {
  const index = itemId === null ? -1 : draft.experience.findIndex((entry) => entry.id === itemId);
  const current = draft.experience[index];
  if (!current) {
    return fail('target_missing', 'target');
  }

  const issues: PatchIssue[] = [];
  const entry = { ...current };
  let changed = false;
  const source = indexSource([answerText, current.employer ?? '', current.title ?? ''].join('\n'));
  const context = entryText(current);

  for (const key of EXPERIENCE_KEYS) {
    const value = trimmed(patch[key]);
    if (value === null) {
      continue;
    }
    const unsupported = unsupportedEntryValue(key, value, source, answerText, context);
    if (entry[key] !== null) {
      issues.push({ rule: 'would_overwrite', path: `patch.${key}` });
    } else if (unsupported !== null) {
      issues.push({ rule: unsupported, path: `patch.${key}` });
    } else {
      entry[key] = value;
      changed = true;
    }
  }

  const bullets = cleanList(patch.bullets).filter((bullet) => !entry.bullets.includes(bullet));
  bullets.forEach((bullet, position) => {
    if (!supportsQuantities(`${answerText}\n${context}`, bullet)) {
      issues.push({ rule: 'unsupported_quantity', path: `patch.bullets.${position}` });
    }
  });
  if (entry.bullets.length + bullets.length > MAX_BULLETS) {
    issues.push({ rule: 'too_many_bullets', path: 'patch.bullets' });
  }
  if (bullets.length > 0) {
    entry.bullets = [...entry.bullets, ...bullets];
    changed = true;
  }

  const experience = draft.experience.map((existing, position) =>
    position === index ? entry : existing,
  );
  return finish(issues, changed, { ...draft, experience });
}

type EducationPatch = Extract<AnswerPatch, { details: string | null; institution: string | null }>;
const EDUCATION_KEYS = ['institution', 'qualification', 'startDate', 'endDate', 'details'] as const;

function applyEducation(
  draft: CvDraft,
  itemId: string | null,
  patch: EducationPatch,
  answerText: string,
): PatchResult {
  const index = itemId === null ? -1 : draft.education.findIndex((entry) => entry.id === itemId);
  const current = draft.education[index];
  if (!current) {
    return fail('target_missing', 'target');
  }

  const issues: PatchIssue[] = [];
  const entry = { ...current };
  let changed = false;
  const source = indexSource(
    [answerText, current.institution ?? '', current.qualification ?? ''].join('\n'),
  );
  const context = entryText(current);

  for (const key of EDUCATION_KEYS) {
    const value = trimmed(patch[key]);
    if (value === null) {
      continue;
    }
    const unsupported = unsupportedEntryValue(key, value, source, answerText, context);
    if (entry[key] !== null) {
      issues.push({ rule: 'would_overwrite', path: `patch.${key}` });
    } else if (unsupported !== null) {
      issues.push({ rule: unsupported, path: `patch.${key}` });
    } else {
      entry[key] = value;
      changed = true;
    }
  }

  const education = draft.education.map((existing, position) =>
    position === index ? entry : existing,
  );
  return finish(issues, changed, { ...draft, education });
}
