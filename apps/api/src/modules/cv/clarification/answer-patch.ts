import type { AnswerPatch } from '../../ai/schemas/answer-patch.schema.js';
import type { QuestionSectionName } from '../../ai/schemas/llm-cv-output.schema.js';
import { cvDraftSchema, type CvDraft } from '../generation/draft.schema.js';
import { indexSource } from '../generation/source-matching.js';

/**
 * Validates an AI-produced patch and applies it to one section or entry of a draft. Pure and
 * deterministic: the AI proposes values, this decides what may land.
 *
 *  - The target is chosen by the server (section + entry id); the patch cannot name another one.
 *  - Additive only: a scalar fills a null value, lists are appended to. A value that would replace
 *    something already there is an issue (`would_overwrite`), never an overwrite.
 *  - Contact details and organisation names must be supported by the person's answer (the same
 *    deterministic checks generation uses). Wording of bullets and summaries cannot be proven
 *    mechanically; that is governed by the prompt contract, as documented for generation.
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
const MAX_SKILLS = 60;

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
): PatchResult {
  switch (target.section) {
    case 'CONTACT':
      return 'fullName' in patch ? applyContact(draft, patch, answerText) : fail('wrong_scope', 'patch');
    case 'SUMMARY':
      return 'summary' in patch ? applySummary(draft, patch) : fail('wrong_scope', 'patch');
    case 'SKILLS':
      return 'skills' in patch ? applySkills(draft, patch) : fail('wrong_scope', 'patch');
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

function applySummary(draft: CvDraft, patch: { summary: string | null }): PatchResult {
  if (draft.summary !== null) {
    // A present summary may be the person's own text: it is never rewritten.
    return fail('target_filled', 'target');
  }
  const summary = trimmed(patch.summary);
  return finish([], summary !== null, { ...draft, summary });
}

function applySkills(draft: CvDraft, patch: { skills: string[] }): PatchResult {
  const known = new Set(draft.skills.map((skill) => skill.toLowerCase()));
  const added: string[] = [];
  for (const skill of cleanList(patch.skills)) {
    if (!known.has(skill.toLowerCase())) {
      known.add(skill.toLowerCase());
      added.push(skill);
    }
  }
  const issues: PatchIssue[] = [];
  if (draft.skills.length + added.length > MAX_SKILLS) {
    issues.push({ rule: 'too_many_skills', path: 'patch.skills' });
  }
  return finish(issues, added.length > 0, { ...draft, skills: [...draft.skills, ...added] });
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

  for (const key of EXPERIENCE_KEYS) {
    const value = trimmed(patch[key]);
    if (value === null) {
      continue;
    }
    if (entry[key] !== null) {
      issues.push({ rule: 'would_overwrite', path: `patch.${key}` });
    } else if (key === 'employer' && !source.hasOrganisation(value)) {
      issues.push({ rule: 'unsupported_organisation', path: 'patch.employer' });
    } else {
      entry[key] = value;
      changed = true;
    }
  }

  const bullets = cleanList(patch.bullets).filter((bullet) => !entry.bullets.includes(bullet));
  if (entry.bullets.length + bullets.length > MAX_BULLETS) {
    issues.push({ rule: 'too_many_bullets', path: 'patch.bullets' });
  }
  if (bullets.length > 0) {
    entry.bullets = [...entry.bullets, ...bullets];
    changed = true;
  }

  const experience = draft.experience.map((existing, position) => (position === index ? entry : existing));
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
  const source = indexSource([answerText, current.institution ?? '', current.qualification ?? ''].join('\n'));

  for (const key of EDUCATION_KEYS) {
    const value = trimmed(patch[key]);
    if (value === null) {
      continue;
    }
    if (entry[key] !== null) {
      issues.push({ rule: 'would_overwrite', path: `patch.${key}` });
    } else if (key === 'institution' && !source.hasOrganisation(value)) {
      issues.push({ rule: 'unsupported_organisation', path: 'patch.institution' });
    } else {
      entry[key] = value;
      changed = true;
    }
  }

  const education = draft.education.map((existing, position) => (position === index ? entry : existing));
  return finish(issues, changed, { ...draft, education });
}
