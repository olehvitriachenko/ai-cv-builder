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

export type QuestionSection = ClarificationQuestion["section"];

export function sectionLabel(section: QuestionSection): string {
  return SECTION_LABELS[section];
}

/** The name of the entry a question concerns (the employer, the institution), or null. */
export function questionTargetName(question: ClarificationQuestion, draft: CvDraft): string | null {
  if (question.itemId === null) {
    return null;
  }
  const entry =
    question.section === "EXPERIENCE"
      ? draft.experience.find((item) => item.id === question.itemId)
      : question.section === "EDUCATION"
        ? draft.education.find((item) => item.id === question.itemId)
        : undefined;
  return entry && "employer" in entry
    ? (entry.employer ?? entry.title)
    : entry
      ? (entry.institution ?? entry.qualification)
      : null;
}

/** "Experience / Kilona": which part of the CV a question is about. */
export function questionContext(question: ClarificationQuestion, draft: CvDraft): string {
  const section = SECTION_LABELS[question.section];
  const name = questionTargetName(question, draft);
  return name ? `${section} / ${name}` : section;
}

export interface AssistantSummary {
  /** "1 unresolved": answered questions not yet applied or dismissed still count. */
  count: string;
  /** The supporting line under the title. */
  line: string;
}

export function assistantSummary(questions: readonly Pick<ClarificationQuestion, "status">[]): AssistantSummary {
  const unresolved = unresolvedCount(questions);
  return {
    count: `${unresolved} unresolved`,
    line: questions.length > 0 && unresolved === 0 ? "All resolved" : "Clarify missing facts and improve your CV",
  };
}

/** The answer's own save, separate from applying it: what the indicator under the answer says. */
export type AnswerSave = "idle" | "saving" | "saved" | "error";

export function answerSaveLabel(save: AnswerSave): string | null {
  switch (save) {
    case "idle":
      return null;
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Answer retained in draft";
  }
}

/**
 * Apply to CV is available only for an answered question whose current text is the one the server
 * holds: nothing waiting to be saved, no save failure and no other apply running. A saved answer is
 * not an applied one; only this explicit action changes the CV.
 */
export function canApplyAnswer(input: {
  status: ClarificationQuestion["status"];
  text: string;
  serverAnswer: string | null;
  save: AnswerSave;
  applying: boolean;
  otherApplyRunning: boolean;
}): boolean {
  return (
    input.status === "ANSWERED" &&
    input.text.trim() !== "" &&
    input.text.trim() === (input.serverAnswer ?? "").trim() &&
    (input.save === "idle" || input.save === "saved") &&
    !input.applying &&
    !input.otherApplyRunning
  );
}

/** The helper line under a question's actions. */
export function answerHelper(status: ClarificationQuestion["status"]): string {
  return status === "ANSWERED"
    ? "Answer saved separately. Your CV stays unchanged until you apply it."
    : "Answer autosaves separately. AI never fills in missing facts.";
}

/** Whether an answer that is not on the server yet should be sent: non-blank and different from what is stored. */
export function answerNeedsSaving(text: string, serverAnswer: string | null): boolean {
  const next = text.trim();
  return next !== "" && next !== (serverAnswer ?? "").trim();
}
