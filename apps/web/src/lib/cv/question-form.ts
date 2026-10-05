import { z } from "zod";
import type { ClarificationQuestion, CvDraft } from "@/lib/api/cvs";

export const MAX_ANSWER_CHARS = 1000;

export const answerFormSchema = z.object({
  answer: z
    .string()
    .trim()
    .min(1, "Write an answer first.")
    .max(MAX_ANSWER_CHARS, `Keep the answer under ${MAX_ANSWER_CHARS} characters.`),
});
export type AnswerFormValues = z.input<typeof answerFormSchema>;

export interface QuestionView {
  label: "Unanswered" | "Answered" | "Applied" | "Dismissed";
  canAnswer: boolean;
  canDismiss: boolean;
  canApply: boolean;
  /** Applied and dismissed questions are resolved and read-only. */
  resolved: boolean;
}

/** What a card shows and allows for each of the four states (mirrors the server's state rules). */
export function questionView(question: Pick<ClarificationQuestion, "status">): QuestionView {
  switch (question.status) {
    case "UNANSWERED":
      return { label: "Unanswered", canAnswer: true, canDismiss: true, canApply: false, resolved: false };
    case "ANSWERED":
      return { label: "Answered", canAnswer: true, canDismiss: true, canApply: true, resolved: false };
    case "APPLIED":
      return { label: "Applied", canAnswer: false, canDismiss: false, canApply: false, resolved: true };
    case "DISMISSED":
      return { label: "Dismissed", canAnswer: false, canDismiss: false, canApply: false, resolved: true };
  }
}

/** Unresolved = unanswered or answered: what the AI assistant header counts. */
export function unresolvedCount(questions: readonly Pick<ClarificationQuestion, "status">[]): number {
  return questions.filter((question) => !questionView(question).resolved).length;
}

const SECTION_LABELS: Record<ClarificationQuestion["section"], string> = {
  CONTACT: "Contact",
  SUMMARY: "Summary",
  EXPERIENCE: "Experience",
  EDUCATION: "Education",
  SKILLS: "Skills",
};

/** "Experience · Northstar Labs": which part of the CV a question is about. */
export function questionContext(question: ClarificationQuestion, draft: CvDraft): string {
  const section = SECTION_LABELS[question.section];
  if (question.itemId === null) {
    return section;
  }
  const entry =
    question.section === "EXPERIENCE"
      ? draft.experience.find((item) => item.id === question.itemId)
      : question.section === "EDUCATION"
        ? draft.education.find((item) => item.id === question.itemId)
        : undefined;
  const name =
    entry && "employer" in entry
      ? (entry.employer ?? entry.title)
      : entry
        ? (entry.institution ?? entry.qualification)
        : null;
  return name ? `${section} · ${name}` : section;
}
