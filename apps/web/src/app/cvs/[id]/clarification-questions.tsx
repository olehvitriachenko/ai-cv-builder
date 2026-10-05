import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ClarificationQuestion, CvDraft } from "@/lib/api/cvs";

const SECTION_LABELS: Record<ClarificationQuestion["section"], string> = {
  CONTACT: "Contact",
  SUMMARY: "Summary",
  EXPERIENCE: "Experience",
  EDUCATION: "Education",
  SKILLS: "Skills",
};

/** "Experience · Acme Corp": which part of the CV a question is about. */
function contextLabel(question: ClarificationQuestion, draft: CvDraft): string {
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

/**
 * Figma "AI Assistant" card, read-only: the persisted clarification questions. Answering them
 * belongs to a later feature, so there are no inputs or actions here.
 */
export function ClarificationQuestions({
  questions,
  draft,
}: {
  questions: ClarificationQuestion[];
  draft: CvDraft;
}) {
  const open = questions.filter(
    (question) => question.status === "UNANSWERED" || question.status === "ANSWERED",
  );

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-tint">
            <Sparkles aria-hidden className="size-4 text-accent" strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-sm font-semibold text-ink">Questions from AI</h2>
            <p className="text-xs text-muted">Facts that weren’t clear from your information</p>
          </div>
        </div>
        {open.length > 0 ? (
          <span className="shrink-0 rounded-full bg-accent-tint px-2 py-1 text-[11px] font-semibold text-accent">
            {open.length} open
          </span>
        ) : null}
      </div>

      {questions.length === 0 ? (
        <p className="rounded-lg bg-success-tint p-3 text-[13px] leading-normal text-success">
          Nothing to clarify. Everything the draft needed was in your information.
        </p>
      ) : (
        <>
          <p className="text-xs leading-normal text-muted">
            These were left out of the draft rather than guessed. Answering them isn’t available
            yet.
          </p>
          <ul className="flex flex-col gap-2.5">
            {questions.map((question) => (
              <li key={question.id} className="flex flex-col gap-2 rounded-[10px] border border-accent-line bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 text-xs break-words text-muted">
                    {contextLabel(question, draft)}
                  </p>
                  <span className="shrink-0 text-[11px] font-semibold text-accent">
                    {question.status === "UNANSWERED" || question.status === "ANSWERED" ? "Open" : "Resolved"}
                  </span>
                </div>
                <p className="text-[13px] leading-[1.4] font-semibold break-words text-ink">
                  {question.question}
                </p>
                <p className="text-xs leading-normal break-words text-muted">{question.missing}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
