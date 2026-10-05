"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { isApiError } from "@/lib/api/fetcher";
import { applyQuestion, saveDraft, type ClarificationQuestion, type CvResult } from "@/lib/api/cvs";
import { ApplyBlockedError, applyAnswer, applyErrorOutcome } from "@/lib/cv/apply-flow";
import { DraftAutosaver } from "@/lib/cv/autosave";
import { prepareDownload } from "@/lib/cv/download-flow";
import { cvFormSchema, toDraft, toFormValues, toTargetRole, type DraftFormValues } from "@/lib/cv/draft-form";
import { DownloadPdfButton } from "../download-pdf-button";
import { ClarificationPanel } from "./clarification-panel";
import { ContactSection } from "./editor-sections/contact-section";
import { EducationSection } from "./editor-sections/education-section";
import { ExperienceSection } from "./editor-sections/experience-section";
import { SkillsSection } from "./editor-sections/skills-section";
import { SummarySection } from "./editor-sections/summary-section";
import { SaveIndicator } from "./save-indicator";
import { FullscreenPreview } from "./fullscreen-preview";
import { PreviewPanel } from "./preview-panel";
import { ConflictBanner, SaveErrorMessage } from "./save-problems";

type MobileView = "editor" | "preview";

/**
 * The document-first editor. Desktop: editing column on the left, live A4 preview on the right.
 * Mobile: one column with an Editor / Preview switch. The form is the only editable state; the
 * preview is derived from it on every keystroke, while the server's revision stays authoritative.
 */
export function EditorWorkspace({
  cvId,
  targetRole,
  result,
  notice,
  fetchLatest,
  onReplace,
}: {
  cvId: string;
  targetRole: string;
  result: CvResult;
  /** A message from the previous action (for example "Answer applied"), shown once. */
  notice: string | null;
  fetchLatest: () => Promise<CvResult>;
  onReplace: (result: CvResult, notice?: string) => void;
}) {
  const [autosaver] = useState(
    () =>
      new DraftAutosaver({
        initialRevision: result.revision,
        save: (revision, payload) => saveDraft(cvId, { revision, ...payload }),
      }),
  );
  const saveState = useSyncExternalStore(autosaver.subscribe, autosaver.getState, autosaver.getState);

  const form = useForm<DraftFormValues>({
    defaultValues: toFormValues(result.draft, result.targetRole),
    resolver: zodResolver(cvFormSchema),
    mode: "onChange",
  });
  // Subscribes this component to every form change, so each keystroke re-renders the preview.
  const watched = useWatch({ control: form.control });
  const [view, setView] = useState<MobileView>("editor");
  const [conflictBusy, setConflictBusy] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const expandRef = useRef<HTMLButtonElement>(null);
  // The last draft handed to the autosaver. Opening the editor (the effect also runs once on mount)
  // therefore saves nothing, while reverting an edit still saves, because it differs from this.
  const lastSent = useRef(JSON.stringify({ draft: result.draft, targetRole: result.targetRole }));

  // The preview and the validity are derived from the form on every render, never stored.
  const current = form.getValues();
  const draft = toDraft(current);
  const role = toTargetRole(current);
  const valid = cvFormSchema.safeParse(current).success;
  const invalid = !valid;

  // A valid change goes to the autosaver; an invalid form is never sent, so the server keeps the
  // last valid version.
  useEffect(() => {
    const json = JSON.stringify({ draft, targetRole: role });
    if (valid && json !== lastSent.current) {
      lastSent.current = json;
      autosaver.change({ draft, targetRole: role });
    }
    // `draft` is a new object on every render; the JSON comparison above is what prevents resends.
  }, [watched, valid, draft, role, autosaver]);

  // Leaving the page (in-app navigation) saves what is pending instead of dropping it.
  useEffect(
    () => () => {
      void autosaver.flush();
    },
    [autosaver],
  );

  // Closing the tab with unsaved or failed changes asks for confirmation.
  const unsaved = invalid || saveState.status !== "idle" && saveState.status !== "saved";
  useEffect(() => {
    if (!unsaved) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  /**
   * Applies an answered question. Pending edits are saved first so the apply runs on the latest
   * revision. On success the server's result replaces the form (the server is authoritative); when
   * the CV or the question changed elsewhere, the latest version is loaded instead.
   */
  async function handleApply(question: ClarificationQuestion): Promise<void> {
    setApplying(true);
    try {
      const updated = await applyAnswer({
        blockedReason: invalid ? "Fix the highlighted fields first, then apply the answer." : null,
        flush: () => autosaver.flush(),
        apply: (revision) => applyQuestion(cvId, question.id, revision),
      });
      onReplace(updated, "Answer applied. Your CV was updated.");
    } catch (error) {
      if (error instanceof ApplyBlockedError) {
        throw error;
      }
      const outcome = applyErrorOutcome(error);
      if (outcome.reload) {
        try {
          onReplace(await fetchLatest(), outcome.message);
          return;
        } catch {
          // Could not reload either: fall through and show the message on the card.
        }
      }
      throw new Error(outcome.message);
    } finally {
      setApplying(false);
    }
  }

  async function resolveConflict(keepMine: boolean) {
    setConflictBusy(true);
    setConflictError(null);
    try {
      const latest = await fetchLatest();
      if (keepMine) {
        autosaver.resolveConflict(latest.revision, { keepPending: true });
      } else {
        onReplace(latest);
      }
    } catch (error) {
      setConflictError(
        isApiError(error, 404)
          ? "This CV no longer exists."
          : "We couldn’t reach the server. Try again in a moment.",
      );
    } finally {
      setConflictBusy(false);
    }
  }

  const name = draft.contact.fullName;
  const editorPaneClass = view === "editor" ? "flex" : "hidden lg:flex";
  const previewPaneClass = view === "preview" ? "flex" : "hidden lg:flex";

  return (
    <FormProvider {...form}>
      <div className="flex flex-1 flex-col">
        <div className="border-b border-line bg-surface">
          <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
            <Link
              href="/cvs"
              className="flex items-center gap-1.5 rounded text-[13px] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
              Back to My CVs
            </Link>
            <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5 [overflow-wrap:anywhere]">
              <h1 className="text-base font-semibold text-ink">{targetRole}</h1>
              <p className="text-[11px] text-muted">{name ?? "Untitled CV"}</p>
            </div>
            <SaveIndicator state={saveState} invalid={invalid} />
            <DownloadPdfButton
              cvId={cvId}
              showIcon
              beforeDownload={() =>
                prepareDownload({
                  blockedReason: invalid ? "Fix the highlighted fields first, then download the PDF." : null,
                  flush: () => autosaver.flush(),
                })
              }
            />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-4 px-4 py-5 sm:px-8 lg:flex-row lg:items-start lg:gap-8 lg:py-8">
          <div role="tablist" aria-label="View" className="flex gap-2 lg:hidden">
            {(["editor", "preview"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view === tab}
                onClick={() => setView(tab)}
                className={`h-10 rounded-[10px] border px-4 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  view === tab ? "border-accent bg-accent text-white" : "border-line bg-surface text-accent"
                }`}
              >
                {tab === "editor" ? "Editor" : "Preview"}
              </button>
            ))}
          </div>

          <div className={`${editorPaneClass} min-w-0 flex-col gap-3 lg:w-[488px] lg:shrink-0`}>
            <div className="flex items-center justify-between gap-3 pb-1">
              <h2 className="text-[21px] font-semibold text-ink">Make it yours</h2>
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <span aria-hidden className="size-[5px] rounded-full bg-success" />
                Edits update the preview
              </p>
            </div>

            {saveState.status === "error" ? <SaveErrorMessage onRetry={() => autosaver.retry()} /> : null}
            {saveState.status === "conflict" && saveState.failure ? (
              <ConflictBanner
                failure={saveState.failure}
                busy={conflictBusy}
                error={conflictError}
                onLoadLatest={() => void resolveConflict(false)}
                onKeepMine={() => void resolveConflict(true)}
              />
            ) : null}

            {notice ? (
              <p role="status" className="rounded-lg bg-canvas p-3 text-[13px] leading-normal text-ink">
                {notice}
              </p>
            ) : null}

            <ClarificationPanel
              cvId={cvId}
              initialQuestions={result.questions}
              draft={draft}
              onApply={handleApply}
              applyDisabled={applying}
            />
            {/* While an apply runs the form is read-only, so nothing is typed over the server's result. */}
            <fieldset disabled={applying} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
              <ContactSection />
              <SummarySection />
              <ExperienceSection />
              <EducationSection />
              <SkillsSection />
            </fieldset>
            <p className="text-[10px] leading-normal text-muted">
              You’re in control. Review AI wording, dates and claims before downloading.
            </p>
          </div>

          <div className={`${previewPaneClass} min-w-0 flex-1 flex-col`}>
            <PreviewPanel
              draft={draft}
              targetRole={targetRole}
              saveStatus={saveState.status}
              invalid={invalid}
              onOpenFullscreen={() => setFullscreen(true)}
              expandRef={expandRef}
            />
          </div>
        </div>
      </div>
      {fullscreen ? (
        <FullscreenPreview
          cvId={cvId}
          draft={draft}
          targetRole={targetRole}
          saveStatus={saveState.status}
          invalid={invalid}
          beforeDownload={() =>
            prepareDownload({
              blockedReason: invalid ? "Fix the highlighted fields first, then download the PDF." : null,
              flush: () => autosaver.flush(),
            })
          }
          onClose={() => {
            setFullscreen(false);
            // The dialog is removed with its state; hand focus back to what opened it.
            requestAnimationFrame(() => expandRef.current?.focus());
          }}
        />
      ) : null}
    </FormProvider>
  );
}

