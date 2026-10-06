"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { TextareaField } from "@/shared/ui/field";
import { answerQuestion, dismissQuestion } from "@/features/cv-editor/api/questions";
import { type ClarificationQuestion, type CvDraft } from "@/entities/cv/schemas";
import { expireActionFeedback, FEEDBACK_FADE_MS } from "@/features/cv-editor/lib/action-feedback";
import { isApiError } from "@/shared/api/fetcher";
import { ApplyBlockedError, ApplyFailureError, type ApplyAction, type ApplyFailure } from "@/features/cv-editor/model/apply-flow";
import { CVS_QUERY_KEY } from "@/entities/cv/lib/query-keys";
import {
  MAX_ANSWER_CHARS,
  answerHelper,
  answerNeedsSaving,
  canApplyAnswer,
  questionContext,
  questionView,
  type AnswerSave,
} from "@/features/cv-editor/model/question-form";
import { KIND_PILL, ResolvedQuestionCard } from "./resolved-question-card";
import { AnswerStatus } from "./answer-status";
import { ApplyFailureNotice } from "./apply-failure";
import { revealSection } from "../../lib/section-links";

/** How long typing pauses before the answer is saved on its own (not part of the CV's own save). */
const ANSWER_SAVE_DELAY_MS = 800;

function failureMessage(error: unknown): string {
  if (isApiError(error, 409)) {
    return "This question can’t be changed any more. It may already be resolved.";
  }
  if (isApiError(error, 404)) {
    return "This question no longer exists.";
  }
  return "We couldn’t save that. Your answer is still here; try again.";
}


/**
 * One clarification question of the AI assistant (Figma 07.1 to 07.3). The answer saves by itself,
 * separately from the CV; **Apply to CV** is the only thing that changes the CV
 * and **Dismiss** closes the question without changing it. Applied and dismissed questions
 * collapse to their question, then disappear after brief feedback. Failures keep the answer and offer the recovery for their cause.
 */
export function QuestionCard({
  cvId,
  question,
  draft,
  onChange,
  onExpire,
  onApply,
  onReviewLatest,
  applyDisabled,
}: {
  cvId: string;
  question: ClarificationQuestion;
  draft: CvDraft;
  onChange: (question: ClarificationQuestion) => void;
  onExpire: (id: string) => void;
  /** Applies this question to the CV (saving pending edits first). Rejects with the reason shown here. */
  onApply: (question: ClarificationQuestion) => Promise<void>;
  /** Loads the latest saved version of the CV into the editor. */
  onReviewLatest: () => Promise<void>;
  /** Another apply is running or the editor is busy. */
  applyDisabled: boolean;
}) {
  const queryClient = useQueryClient();
  const view = questionView(question);
  const context = questionContext(question, draft);
  const [keepVisible, setKeepVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!view.resolved || keepVisible || leaving) return;
    return expireActionFeedback(() => setLeaving(true));
  }, [view.resolved, keepVisible, leaving]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onExpire(question.id), FEEDBACK_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, question.id, onExpire]);
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(question.answer ?? "");
  const [applying, setApplying] = useState(false);
  const [failure, setFailure] = useState<ApplyFailure | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const refreshList = () => void queryClient.invalidateQueries({ queryKey: CVS_QUERY_KEY });
  const save = useMutation({
    mutationFn: (answer: string) => answerQuestion(cvId, question.id, answer.trim()),
    onSuccess: (next) => {
      onChange(next);
      refreshList();
    },
  });
  const dismiss = useMutation({
    mutationFn: () => dismissQuestion(cvId, question.id),
    onSuccess: (next) => {
      onChange(next);
      refreshList();
    },
  });

  // Typing saves the answer after a pause. One save runs at a time; a failed save is retried only
  // by the person (Retry answer save), never in a loop.
  const saving = save.isPending;
  const saveFailed = save.isError && save.variables === text;
  useEffect(() => {
    if (!view.canAnswer || saving || saveFailed || !answerNeedsSaving(text, question.answer)) {
      return;
    }
    const timer = setTimeout(() => save.mutate(text), ANSWER_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // `save` is stable enough; the inputs that decide whether to save are listed.
  }, [text, question.answer, view.canAnswer, saving, saveFailed, save]);

  // Resize before paint so the textarea never flashes back to its one-line height.
  useLayoutEffect(() => {
    const element = answerRef.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }
  }, [text]);

  const saveState: AnswerSave = saving
    ? "saving"
    : saveFailed
      ? "error"
      : question.status === "ANSWERED" && !answerNeedsSaving(text, question.answer)
        ? "saved"
        : "idle";
  const applyEnabled = canApplyAnswer({
    status: question.status,
    text,
    serverAnswer: question.answer,
    save: saveState,
    applying,
    otherApplyRunning: applyDisabled,
  });
  const busy = applying || dismiss.isPending;
  const problem = dismiss.isError ? failureMessage(dismiss.error) : null;

  async function apply() {
    setApplying(true);
    setFailure(null);
    setBlocked(null);
    try {
      await onApply(question);
    } catch (error) {
      if (error instanceof ApplyFailureError) {
        setFailure(error.failure);
      } else if (error instanceof ApplyBlockedError) {
        setBlocked(error.message);
      } else {
        setBlocked("We couldn’t apply that answer. Nothing was changed; try again.");
      }
    } finally {
      setApplying(false);
    }
  }

  function recover(action: ApplyAction) {
    switch (action) {
      case "retry_later":
        setFailure(null);
        break;
      case "edit_manually":
      case "review_section":
        revealSection(question.section);
        break;
      case "re_answer":
        setFailure(null);
        answerRef.current?.focus();
        break;
      case "dismiss":
        dismiss.mutate();
        break;
      case "review_latest":
        void onReviewLatest();
        break;
      case "retry_after_review":
        void apply();
        break;
    }
  }

  if (view.resolved) {
    return <ResolvedQuestionCard question={question} view={view} context={context} leaving={leaving} setKeepVisible={setKeepVisible} />;
  }

  const helperId = `${question.id}-helper`;
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-[10px] border border-accent-line bg-surface p-3">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={`${KIND_PILL} shrink-0`}>Factual</span>
            <p className="min-w-0 flex-1 text-[11px] leading-[normal] break-words text-muted">{context}</p>
          </div>
          <span className="shrink-0 text-right text-[10px] leading-[normal] font-semibold whitespace-nowrap text-accent">{view.label}</span>
        </div>
        <p className="text-[13px] leading-[1.4] font-semibold break-words text-ink">{question.question}</p>
        <TextareaField
          ref={answerRef}
          label="Your answer"
          labelHidden
          rows={1}
          maxLength={MAX_ANSWER_CHARS}
          placeholder="Your confirmed answer…"
          aria-describedby={helperId}
          className="min-h-11! overflow-hidden py-[11px]"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      <AnswerStatus save={saveState} />

      {applying ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs leading-normal text-accent">Applying to {context}…</p>
          <div className="h-1 overflow-hidden rounded-full bg-accent-line">
            <div className="h-full w-1/3 rounded-full bg-accent motion-safe:animate-indeterminate" />
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        <Button
          type="button"
          variant={applyEnabled ? "primary" : "secondary"}
          stretch={false}
          disabled={!applyEnabled}
          className="w-full whitespace-nowrap sm:w-32"
          onClick={() => void apply()}
        >
          {applying ? "Applying…" : (
            <>
              <Download aria-hidden className="size-4" strokeWidth={1.75} />
              Apply to CV
            </>
          )}
        </Button>
        <Button type="button" variant="text" stretch={false} disabled={busy} className="w-full whitespace-nowrap sm:w-32" onClick={() => dismiss.mutate()}>
          {dismiss.isPending ? "Dismissing…" : "Dismiss"}
        </Button>
        {saveState === "error" ? (
          <Button
            type="button"
            variant="secondary"
            stretch={false}
            className="text-accent!"
            onClick={() => save.mutate(text)}
          >
            Retry answer save
          </Button>
        ) : null}
      </div>
      <p id={helperId} className="text-xs leading-normal text-muted">
        {answerHelper(question.status)}
      </p>

      {failure ? (
        <ApplyFailureNotice failure={failure} retainedAnswer={question.answer} target={context} onAction={recover} />
      ) : null}
      {blocked ? (
        <p role="alert" className="rounded-lg bg-danger-tint p-2 text-xs text-danger">
          <span className="font-medium">Error: </span>
          {blocked}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="rounded-lg bg-danger-tint p-2 text-xs text-danger">
          <span className="font-medium">Error: </span>
          {problem}
        </p>
      ) : null}
    </li>
  );
}
