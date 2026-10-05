import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { LlmCvOutput, QuestionSectionName } from '../../ai/schemas/llm-cv-output.schema.js';
import type { CvDraft, cvDraftSchema } from './draft.schema.js';

/** The draft shape before schema validation (strings not yet trimmed or checked). */
export type DraftCandidate = z.input<typeof cvDraftSchema>;

export type LlmQuestion = LlmCvOutput['questions'][number];

/** A clarification question ready to be stored. */
export interface QuestionRow {
  section: QuestionSectionName;
  /** Id of the experience/education entry it concerns; null for a section-level question. */
  itemId: string | null;
  missing: string;
  question: string;
  position: number;
  status: 'OPEN';
}

/**
 * Pure structural conversion of model output into the persisted draft shape. Entry ids are
 * generated here, never by the model, so the model cannot invent or collide ids. Nothing is
 * validated or trimmed yet: that is `validateGeneration`'s job.
 */
export function mapOutputToDraft(
  output: LlmCvOutput,
  newId: () => string = randomUUID,
): DraftCandidate {
  return {
    schemaVersion: 1,
    contact: { ...output.contact, links: [...output.contact.links] },
    summary: output.summary,
    experience: output.experience.map((entry) => ({ id: newId(), ...entry })),
    education: output.education.map((entry) => ({ id: newId(), ...entry })),
    skills: [...output.skills],
  };
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
      missing: question.missing,
      question: question.question,
      position,
      status: 'OPEN',
    };
  });
}
