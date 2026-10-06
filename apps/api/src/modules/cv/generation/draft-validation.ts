import type { LlmCvOutput } from '../../ai/schemas/llm-cv-output.schema.js';
import {
  mapOutputToDraft,
  mapQuestions,
  normalizeQuestions,
  type DraftCandidate,
  type LlmQuestion,
  type QuestionRow,
} from './draft-mapper.js';
import { MAX_QUESTIONS, MAX_QUESTION_TEXT, cvDraftSchema, type CvDraft } from './draft.schema.js';
import { containsFact, supportsQuantities } from './explicit-facts.js';
import { indexSource, type SourceIndex } from './source-matching.js';

/**
 * Domain validation of model output that has already passed the output schema. Pure and
 * deterministic.
 *
 * Checked mechanically:
 *  - structure: every section present, size caps, no blank strings, no empty entries (the persisted
 *    draft schema), and valid clarification questions;
 *  - contact details and the person's name against the source (strict, see source-matching);
 *  - employer and institution names against the source (tolerant of formatting, not of names);
 *  - the facts of optional-section items (names, issuers, links, dates, numbers and custom-section
 *    text) against the source; an item that fails is removed instead of failing the CV.
 *
 * Explicit dates, skills and numeric claims are source-checked. Arbitrary prose and titles remain governed
 * by the prompt contract and by clarification questions.
 *
 * Issues carry rule ids and JSON paths only, never draft or source values, so they are safe to
 * send back to the model as retry feedback and to store as `failureDetail`.
 */
export interface ValidationIssue {
  rule: string;
  path: string;
}

export type GenerationValidation =
  | { ok: true; draft: CvDraft; questions: QuestionRow[]; removed: ValidationIssue[] }
  | { ok: false; issues: ValidationIssue[] };

export function formatIssue(issue: ValidationIssue): string {
  return `${issue.path || '(root)'}: ${issue.rule}`;
}

function structureIssues(candidate: DraftCandidate): {
  draft?: CvDraft;
  issues: ValidationIssue[];
} {
  const parsed = cvDraftSchema.safeParse(candidate);
  if (parsed.success) {
    return { draft: parsed.data, issues: [] };
  }
  return {
    issues: parsed.error.issues.map((issue) => ({
      rule: `draft_${issue.code}`,
      path: issue.path.join('.'),
    })),
  };
}

function questionIssues(output: LlmCvOutput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const questions = normalizeQuestions(output.questions);

  if (questions.length > MAX_QUESTIONS) {
    issues.push({ rule: 'too_many_questions', path: 'questions' });
  }

  questions.forEach((question, index) => {
    const base = `questions.${index}`;

    if (question.missing.length === 0) {
      issues.push({ rule: 'blank_text', path: `${base}.missing` });
    } else if (question.missing.length > MAX_QUESTION_TEXT) {
      issues.push({ rule: 'text_too_long', path: `${base}.missing` });
    }
    if (question.question.length === 0) {
      issues.push({ rule: 'blank_text', path: `${base}.question` });
    } else if (question.question.length > MAX_QUESTION_TEXT) {
      issues.push({ rule: 'text_too_long', path: `${base}.question` });
    }

    const entryCount =
      question.section === 'EXPERIENCE'
        ? output.experience.length
        : question.section === 'EDUCATION'
          ? output.education.length
          : 0;
    const hasEntry = question.section === 'EXPERIENCE' || question.section === 'EDUCATION';
    if (question.itemIndex !== null) {
      if (!hasEntry || question.itemIndex < 0 || question.itemIndex >= entryCount) {
        issues.push({ rule: 'invalid_item_index', path: `${base}.itemIndex` });
      }
    }

    // A field names the one value the answer fills, so it must belong to the question's section
    // (the prefix), and an entry field needs an entry while a contact field must not point at one.
    if (question.field !== undefined) {
      const inSection = question.field.startsWith(`${question.section}_`);
      const needsEntry = hasEntry;
      if (!inSection || needsEntry !== (question.itemIndex !== null)) {
        issues.push({ rule: 'question_field_mismatch', path: `${base}.field` });
      }
    }
  });

  return issues;
}

/**
 * Contact details alone are not a CV: it needs a summary or at least one entry. A draft without
 * that is only acceptable when the model asked what is missing.
 */
function hasMeaningfulContent({
  summary,
  experience,
  education,
  skillCategories,
}: CvDraft): boolean {
  return (
    summary !== null ||
    experience.length > 0 ||
    education.length > 0 ||
    skillCategories.some((category) => category.skills.length > 0)
  );
}

function sourceIssues(draft: CvDraft, source: SourceIndex, sourceText: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { contact } = draft;

  if (contact.fullName !== null && !source.hasPersonName(contact.fullName)) {
    issues.push({ rule: 'unsupported_name', path: 'contact.fullName' });
  }
  if (contact.email !== null && !source.hasEmail(contact.email)) {
    issues.push({ rule: 'unsupported_contact', path: 'contact.email' });
  }
  if (contact.phone !== null && !source.hasPhone(contact.phone)) {
    issues.push({ rule: 'unsupported_contact', path: 'contact.phone' });
  }
  contact.links.forEach((link, index) => {
    if (!source.hasLink(link)) {
      issues.push({ rule: 'unsupported_contact', path: `contact.links.${index}` });
    }
  });

  draft.experience.forEach((entry, index) => {
    if (entry.employer !== null && !source.hasOrganisation(entry.employer)) {
      issues.push({ rule: 'unsupported_organisation', path: `experience.${index}.employer` });
    }
  });
  draft.education.forEach((entry, index) => {
    if (entry.institution !== null && !source.hasOrganisation(entry.institution)) {
      issues.push({ rule: 'unsupported_organisation', path: `education.${index}.institution` });
    }
  });

  const checkQuantity = (value: string | null, path: string) => {
    if (value !== null && !supportsQuantities(sourceText, value))
      issues.push({ rule: 'unsupported_quantity', path });
  };
  checkQuantity(draft.summary, 'summary');
  for (const section of ['experience', 'education'] as const) {
    draft[section].forEach((entry, index) => {
      for (const field of ['startDate', 'endDate'] as const) {
        const value = entry[field];
        if (value !== null && !containsFact(sourceText, value))
          issues.push({ rule: 'unsupported_date', path: `${section}.${index}.${field}` });
      }
      if ('bullets' in entry)
        entry.bullets.forEach((bullet, i) =>
          checkQuantity(bullet, `${section}.${index}.bullets.${i}`),
        );
      if ('details' in entry) checkQuantity(entry.details, `${section}.${index}.details`);
    });
  }
  draft.skillCategories.forEach((category, index) =>
    category.skills.forEach((skill, i) => {
      if (!containsFact(sourceText, skill))
        issues.push({ rule: 'unsupported_skill', path: `skillCategories.${index}.skills.${i}` });
    }),
  );

  return issues;
}

/** The first unsupported fact of an item, or null when every check passes. */
function firstFailure(
  checks: [supported: boolean, rule: string, path: string][],
): ValidationIssue | null {
  const failed = checks.find(([supported]) => !supported);
  return failed ? { rule: failed[1], path: failed[2] } : null;
}

/** Keeps the items without an unsupported fact; records why each other one was removed. */
function keepSupported<T>(
  items: T[],
  check: (item: T, index: number) => ValidationIssue | null,
  removed: ValidationIssue[],
): T[] {
  return items.filter((item, index) => {
    const issue = check(item, index);
    if (issue) {
      removed.push(issue);
    }
    return issue === null;
  });
}

/**
 * Optional sections are extras, not the CV the person asked for, so an item with an unsupported
 * fact is removed whole (never kept in part) instead of failing an otherwise valid CV. Their facts
 * are checked like the core ones: names, issuers, links, dates and numbers must be in the source,
 * and a custom section's text must use only the source's words. A custom section's title is not a
 * fact but a label the model chooses ("Publications" for a "Paper:" line), so it is not checked.
 */
function withoutUnsupportedOptionalItems(
  draft: CvDraft,
  source: SourceIndex,
  sourceText: string,
): { draft: CvDraft; removed: ValidationIssue[] } {
  const removed: ValidationIssue[] = [];
  const quantities = (value: string | null) =>
    value === null || supportsQuantities(sourceText, value);

  const languages = keepSupported(
    draft.languages,
    (entry, index) =>
      firstFailure([
        [
          source.hasOrganisation(entry.name),
          'unsupported_section_value',
          `languages.${index}.name`,
        ],
      ]),
    removed,
  );
  const certifications = keepSupported(
    draft.certifications,
    (entry, index) =>
      firstFailure([
        [
          source.hasOrganisation(entry.name),
          'unsupported_section_value',
          `certifications.${index}.name`,
        ],
        [
          entry.issuer === null || source.hasOrganisation(entry.issuer),
          'unsupported_organisation',
          `certifications.${index}.issuer`,
        ],
        [
          entry.date === null || containsFact(sourceText, entry.date),
          'unsupported_date',
          `certifications.${index}.date`,
        ],
        [
          entry.link === null || source.hasLink(entry.link),
          'unsupported_contact',
          `certifications.${index}.link`,
        ],
      ]),
    removed,
  );
  const portfolio = keepSupported(
    draft.portfolio,
    (entry, index) =>
      firstFailure([
        [
          source.hasOrganisation(entry.name),
          'unsupported_section_value',
          `portfolio.${index}.name`,
        ],
        [
          entry.link === null || source.hasLink(entry.link),
          'unsupported_contact',
          `portfolio.${index}.link`,
        ],
        [quantities(entry.description), 'unsupported_quantity', `portfolio.${index}.description`],
      ]),
    removed,
  );
  const hobbies = keepSupported(
    draft.hobbies,
    (hobby, index) =>
      firstFailure([
        [source.hasOrganisation(hobby), 'unsupported_section_value', `hobbies.${index}`],
      ]),
    removed,
  );
  const customSections = keepSupported(
    draft.customSections,
    (entry, index) =>
      firstFailure([
        [
          source.hasWords(entry.content),
          'unsupported_section_value',
          `customSections.${index}.content`,
        ],
        [quantities(entry.content), 'unsupported_quantity', `customSections.${index}.content`],
      ]),
    removed,
  );

  return {
    draft: { ...draft, languages, certifications, portfolio, hobbies, customSections },
    removed,
  };
}

/** Words only a question about language levels uses; see `aboutOptionalSection`. */
const LANGUAGE_LEVEL_WORDS = /\b(?:CEFR|native speaker|mother tongue|speak|spoken)\b/iu;

/**
 * A clarification answer can land only in contact, summary, experience, education or skills. A
 * question about a language, certification, project or hobby has no such target (an answer about
 * language levels would land among the skills), so it is not stored. Such a question names one of
 * those items or asks about language levels.
 */
function aboutOptionalSection(question: LlmQuestion, draft: CvDraft): boolean {
  const text = `${question.missing}\n${question.question}`;
  if (LANGUAGE_LEVEL_WORDS.test(text)) {
    return true;
  }
  const names = [
    ...draft.languages.map((entry) => entry.name),
    ...draft.certifications.map((entry) => entry.name),
    ...draft.portfolio.map((entry) => entry.name),
    ...draft.hobbies,
  ];
  return names.some((name) => containsFact(text, name));
}

/**
 * Returns the validated draft and question rows, or every rule violation found. `removed` lists the
 * optional items left out of the draft (rule ids and paths only, for the log).
 */
export function validateGeneration(output: LlmCvOutput, sourceText: string): GenerationValidation {
  const structure = structureIssues(mapOutputToDraft(output));
  const issues = [...structure.issues, ...questionIssues(output)];
  let checked: { draft: CvDraft; removed: ValidationIssue[] } | undefined;

  if (structure.draft) {
    const source = indexSource(sourceText);
    checked = withoutUnsupportedOptionalItems(structure.draft, source, sourceText);
    issues.push(...sourceIssues(checked.draft, source, sourceText));
    if (!hasMeaningfulContent(checked.draft) && output.questions.length === 0) {
      issues.push({ rule: 'empty_result', path: '' });
    }
  }

  if (issues.length > 0 || !checked) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    draft: checked.draft,
    questions: mapQuestions(
      normalizeQuestions(output.questions).filter(
        (question) => !aboutOptionalSection(question, checked.draft),
      ),
      checked.draft,
    ),
    removed: checked.removed,
  };
}
