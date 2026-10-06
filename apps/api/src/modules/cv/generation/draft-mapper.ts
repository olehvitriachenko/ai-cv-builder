import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { QuestionField } from '../../../generated/prisma/enums.js';
import {
  type LlmCvOutput,
  type OptionalItemSection,
  QuestionFieldName,
  QuestionSectionName,
} from '../../ai/schemas/llm-cv-output.schema.js';
import { LANGUAGE_LEVELS, type CvDraft, type cvDraftSchema } from './draft.schema.js';

/** The draft shape before schema validation (strings not yet trimmed or checked). */
export type DraftCandidate = z.input<typeof cvDraftSchema>;

export type LlmQuestion = LlmCvOutput['questions'][number];

/** A clarification question ready to be stored. */
export interface QuestionRow {
  section: QuestionSectionName;
  /** Id of the experience/education entry it concerns; null for a section-level question. */
  itemId: string | null;
  /** The single plain value the answer fills, or null (the answer then goes through the AI path). */
  field: QuestionFieldName | null;
  missing: string;
  question: string;
  position: number;
  status: 'UNANSWERED';
}

// Compile-time guard: the LLM contract's field list and the database enum are the same set.
type AssertSameSet<A extends string, B extends string> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const QUESTION_FIELDS_MATCH_DATABASE: AssertSameSet<QuestionFieldName, QuestionField> = true;

/**
 * Pure structural conversion of model output into the persisted draft shape. Entry ids are
 * generated here, never by the model, so the model cannot invent or collide ids. Nothing is
 * validated or trimmed yet: that is `validateGeneration`'s job.
 */
export function mapOutputToDraft(
  output: LlmCvOutput,
  newId: () => string = randomUUID,
): DraftCandidate {
  const experience = output.experience.map((entry) => ({ id: newId(), ...entry }));
  const education = output.education.map((entry) => ({ id: newId(), ...entry }));
  return {
    schemaVersion: 2,
    contact: { ...output.contact, links: [...output.contact.links] },
    summary: output.summary,
    experience,
    education,
    skillCategories: groupSkills(output.skillCategories, newId),
    ...mapOptionalSections(output, newId),
  };
}

const nullIfBlank = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** First occurrence wins; blank values and repeats (ignoring case) are dropped. */
function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item).trim().toLowerCase();
    if (value === '' || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/**
 * The optional items of the output as the draft's sections: ids generated here, "" becomes null,
 * a language level that is not one of the allowed levels becomes null, an item without its name
 * (the one required value) is dropped, and a language or a hobby listed twice keeps its first
 * mention. Caps are not applied: an over-cap result is rejected by `validateGeneration` and retried.
 */
function mapOptionalSections(
  output: LlmCvOutput,
  newId: () => string,
): Pick<DraftCandidate, 'languages' | 'certifications' | 'portfolio' | 'hobbies' | 'customSections'> {
  const items = output.optionalItems ?? [];
  const of = (section: OptionalItemSection) => items.filter((item) => item.section === section);
  return {
    languages: uniqueBy(of('language'), (item) => item.name).map((item) => ({
      id: newId(),
      name: item.name,
      level: LANGUAGE_LEVELS.find((level) => level === item.detail.trim()) ?? null,
    })),
    certifications: of('certification')
      .filter((item) => item.name.trim() !== '')
      .map((item) => ({
        id: newId(),
        name: item.name,
        issuer: nullIfBlank(item.detail),
        date: nullIfBlank(item.date),
        link: nullIfBlank(item.link),
      })),
    portfolio: of('portfolio')
      .filter((item) => item.name.trim() !== '')
      .map((item) => ({
        id: newId(),
        name: item.name,
        link: nullIfBlank(item.link),
        description: nullIfBlank(item.detail),
      })),
    hobbies: uniqueBy(of('hobby'), (item) => item.name).map((item) => item.name),
    customSections: of('custom')
      .filter((item) => item.name.trim() !== '' && item.detail.trim() !== '')
      .map((item) => ({ id: newId(), title: item.name, content: item.detail })),
  };
}

/**
 * Turns the model's `{ category, skills }` list into stored categories: the same category named
 * twice merges into its first occurrence, blank skills and case-insensitive duplicates across the
 * whole CV are dropped (first wins), categories left empty are dropped, and ids are generated here.
 * Caps are not applied: an over-cap result is rejected by `validateGeneration` and retried.
 */
function groupSkills(
  groups: LlmCvOutput['skillCategories'],
  newId: () => string,
): DraftCandidate['skillCategories'] {
  const seenSkills = new Set<string>();
  const byName = new Map<string, string[]>();

  for (const group of groups) {
    const skills = byName.get(group.category) ?? [];
    for (const raw of group.skills) {
      const skill = raw.trim();
      const key = skill.toLowerCase();
      if (skill !== '' && !seenSkills.has(key)) {
        seenSkills.add(key);
        skills.push(skill);
      }
    }
    byName.set(group.category, skills);
  }

  return [...byName]
    .filter(([, skills]) => skills.length > 0)
    .map(([name, skills]) => ({ id: newId(), name, skills }));
}

function questionKey(question: LlmQuestion): string {
  const text = question.question.toLowerCase().replace(/\s+/g, ' ');
  return `${question.section}|${question.itemIndex ?? ''}|${text}`;
}

/** Trims the text of each question and removes duplicates (same section, entry and question). */
export function normalizeQuestions(questions: LlmQuestion[]): LlmQuestion[] {
  const seen = new Set<string>();
  const result: LlmQuestion[] = [];

  for (const question of questions) {
    const trimmed = {
      ...question,
      missing: question.missing.trim(),
      question: question.question.trim(),
    };
    const key = questionKey(trimmed);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Converts each question's `itemIndex` (position inside its section) into the stable `itemId` of
 * the entry in the validated draft, and assigns display positions in order. The indices must
 * already have been validated.
 */
export function mapQuestions(questions: LlmQuestion[], draft: CvDraft): QuestionRow[] {
  return questions.map((question, position) => {
    const entries =
      question.section === 'EXPERIENCE'
        ? draft.experience
        : question.section === 'EDUCATION'
          ? draft.education
          : [];
    const entry = question.itemIndex === null ? undefined : entries[question.itemIndex];

    return {
      section: question.section,
      itemId: entry ? entry.id : null,
      field: question.field ?? null,
      missing: question.missing,
      question: question.question,
      position,
      status: 'UNANSWERED',
    };
  });
}
