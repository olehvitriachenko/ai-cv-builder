"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import type { ClarificationQuestion, CvDraft } from "@/lib/api/cvs";
import { assistantSummary } from "@/lib/cv/question-form";
import { QuestionCard } from "./question-card";

/**
 * Figma "AI Assistant" (05.1, 07.1 to 07.3): the persisted clarification questions, secondary to
 * the document. The server's questions seed the list; each save or dismissal replaces its own
 * question with the server's reply, so what is shown is always what the server stored.
 */
export function ClarificationPanel({
  cvId,
  initialQuestions,
  draft,
  onApply,
  onReviewLatest,
  applyDisabled,
}: {
  cvId: string;
  initialQuestions: ClarificationQuestion[];
  draft: CvDraft;
  onApply: (question: ClarificationQuestion) => Promise<void>;
  onReviewLatest: () => Promise<void>;
  applyDisabled: boolean;
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const summary = assistantSummary(questions);
  const [hiddenQuestions, setHiddenQuestions] = useState<string[]>([]);
  const hideResolved = useCallback((id: string) => {
    setHiddenQuestions((current) => [...current, id]);
  }, []);

  function replace(next: ClarificationQuestion) {
    setQuestions((current) => current.map((question) => (question.id === next.id ? next : question)));
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-tint">
            <Sparkles aria-hidden className="size-4 text-accent" strokeWidth={1.75} />
          </span>
          <h3 className="text-sm leading-[normal] font-semibold text-ink">AI Assistant</h3>
        </div>
        {questions.length > 0 ? (
          <p role="status" className="shrink-0 text-[11px] leading-[normal] font-semibold text-accent">
            {summary.count}
          </p>
        ) : null}
      </div>

      {questions.length === 0 ? (
        <p className="rounded-lg bg-success-tint p-3 text-[13px] leading-normal text-success">
          Nothing to clarify. Everything the draft needed was in your information.
        </p>
      ) : (
        <>
          <p className="text-xs leading-normal text-muted">{summary.line}</p>
          <ul className="flex flex-col gap-4">
            {questions.filter((question) => !hiddenQuestions.includes(question.id)).map((question) => (
              <QuestionCard
                key={question.id}
                cvId={cvId}
                question={question}
                draft={draft}
                onChange={replace}
                onExpire={hideResolved}
                onApply={onApply}
                onReviewLatest={onReviewLatest}
                applyDisabled={applyDisabled}
              />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
