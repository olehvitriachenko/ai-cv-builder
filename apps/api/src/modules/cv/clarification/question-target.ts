import { z } from 'zod';
import type { QuestionField, QuestionSection } from '../../../generated/prisma/enums.js';
import type { CvDraft } from '../generation/draft.schema.js';

/**
 * Where an answer goes. The server chooses the target from the question's stored `section`,
 * `itemId` and `field`; the client never names a path or an operation. These functions are pure:
 * they return a new draft (the input is never mutated) or the reason nothing can be applied.
 *
 * Nothing already filled is overwritten: a scalar is written only when it is null, a list is only
 * appended to. That is what keeps the person's manual edits authoritative.
 */
export type TargetProblem =
  /** The entry the question was about no longer exists. */
  | 'TARGET_MISSING'
  /** The value is already there (the person filled it, or it was generated). */
  | 'TARGET_FILLED'
  /** The answer does not fit the field (too long, not an email, blank). */
  | 'INVALID_VALUE';

export type ApplyResult = { ok: true; draft: CvDraft } | { ok: false; reason: TargetProblem };

type ScalarKey = 'employer' | 'title' | 'location' | 'startDate' | 'endDate';
type EducationKey = 'institution' | 'qualification' | 'startDate' | 'endDate';

interface FieldRule {
  max: number;
  /** Extra check on the trimmed value. */
  valid?: (value: string) => boolean;
}

const isEmail = (value: string) => z.email().safeParse(value).success;
/** A phone number needs at least 5 digits (the same floor generation uses to check one). */
const isPhone = (value: string) => value.replace(/\D/g, '').length >= 5;

const CONTACT_RULES = {
  CONTACT_FULL_NAME: { key: 'fullName', rule: { max: 120 } },
  CONTACT_EMAIL: { key: 'email', rule: { max: 254, valid: isEmail } },
  CONTACT_PHONE: { key: 'phone', rule: { max: 40, valid: isPhone } },
  CONTACT_LOCATION: { key: 'location', rule: { max: 120 } },
} as const satisfies Partial<Record<QuestionField, { key: string; rule: FieldRule }>>;

const EXPERIENCE_RULES = {
  EXPERIENCE_EMPLOYER: { key: 'employer', rule: { max: 200 } },
  EXPERIENCE_TITLE: { key: 'title', rule: { max: 200 } },
  EXPERIENCE_LOCATION: { key: 'location', rule: { max: 120 } },
  EXPERIENCE_START_DATE: { key: 'startDate', rule: { max: 40 } },
  EXPERIENCE_END_DATE: { key: 'endDate', rule: { max: 40 } },
} as const satisfies Partial<Record<QuestionField, { key: ScalarKey; rule: FieldRule }>>;

const EDUCATION_RULES = {
  EDUCATION_INSTITUTION: { key: 'institution', rule: { max: 200 } },
  EDUCATION_QUALIFICATION: { key: 'qualification', rule: { max: 200 } },
  EDUCATION_START_DATE: { key: 'startDate', rule: { max: 40 } },
  EDUCATION_END_DATE: { key: 'endDate', rule: { max: 40 } },
} as const satisfies Partial<Record<QuestionField, { key: EducationKey; rule: FieldRule }>>;

/** Narrows a field to a key of one rule table (a type guard, so no assertion is needed). */
function isKeyOf<T extends object>(table: T, key: PropertyKey): key is keyof T {
  return key in table;
}

const MAX_LINKS = 5;
const MAX_LINK_CHARS = 200;

function fits(value: string, rule: FieldRule): boolean {
  return value.length > 0 && value.length <= rule.max && (rule.valid?.(value) ?? true);
}

/** Fills one plain value (or appends one link) for the question's `field`. Pure. */
export function applyFieldAnswer(
  draft: CvDraft,
  field: QuestionField,
  itemId: string | null,
  answer: string,
): ApplyResult {
  const value = answer.trim();

  if (field === 'CONTACT_LINK') {
    if (value.length === 0 || value.length > MAX_LINK_CHARS) {
      return { ok: false, reason: 'INVALID_VALUE' };
    }
    if (draft.contact.links.length >= MAX_LINKS || draft.contact.links.includes(value)) {
      return { ok: false, reason: 'TARGET_FILLED' };
    }
    return { ok: true, draft: { ...draft, contact: { ...draft.contact, links: [...draft.contact.links, value] } } };
  }

  if (isKeyOf(CONTACT_RULES, field)) {
    const { key, rule } = CONTACT_RULES[field];
    // Filled first: when the value is already there the useful answer is "dismiss it".
    if (draft.contact[key] !== null) {
      return { ok: false, reason: 'TARGET_FILLED' };
    }
    if (!fits(value, rule)) {
      return { ok: false, reason: 'INVALID_VALUE' };
    }
    return { ok: true, draft: { ...draft, contact: { ...draft.contact, [key]: value } } };
  }

  if (isKeyOf(EXPERIENCE_RULES, field)) {
    const { key, rule } = EXPERIENCE_RULES[field];
    const index = itemId === null ? -1 : draft.experience.findIndex((entry) => entry.id === itemId);
    const entry = draft.experience[index];
    if (!entry) {
      return { ok: false, reason: 'TARGET_MISSING' };
    }
    if (entry[key] !== null) {
      return { ok: false, reason: 'TARGET_FILLED' };
    }
    if (!fits(value, rule)) {
      return { ok: false, reason: 'INVALID_VALUE' };
    }
    const experience = draft.experience.map((current, position) =>
      position === index ? { ...current, [key]: value } : current,
    );
    return { ok: true, draft: { ...draft, experience } };
  }

  if (isKeyOf(EDUCATION_RULES, field)) {
    const { key, rule } = EDUCATION_RULES[field];
    const index = itemId === null ? -1 : draft.education.findIndex((entry) => entry.id === itemId);
    const entry = draft.education[index];
    if (!entry) {
      return { ok: false, reason: 'TARGET_MISSING' };
    }
    if (entry[key] !== null) {
      return { ok: false, reason: 'TARGET_FILLED' };
    }
    if (!fits(value, rule)) {
      return { ok: false, reason: 'INVALID_VALUE' };
    }
    const education = draft.education.map((current, position) =>
      position === index ? { ...current, [key]: value } : current,
    );
    return { ok: true, draft: { ...draft, education } };
  }

  return { ok: false, reason: 'INVALID_VALUE' };
}

/**
 * Whether an AI-assisted apply can still target this part of the draft: the entry must exist, and
 * a summary question is only applicable while there is no summary (a present summary may be the
 * person's own text, so it is never rewritten). Null means the target is available.
 */
export function checkTarget(
  draft: CvDraft,
  question: { section: QuestionSection; itemId: string | null },
): TargetProblem | null {
  switch (question.section) {
    case 'EXPERIENCE':
      return draft.experience.some((entry) => entry.id === question.itemId) ? null : 'TARGET_MISSING';
    case 'EDUCATION':
      return draft.education.some((entry) => entry.id === question.itemId) ? null : 'TARGET_MISSING';
    case 'SUMMARY':
      return draft.summary === null ? null : 'TARGET_FILLED';
    case 'CONTACT':
    case 'SKILLS':
      return null;
  }
}
