"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FormProvider } from "react-hook-form";
import type { CvResult } from "@/lib/api/cvs";
import { ANSWER_APPLIED_NOTICE } from "@/lib/cv/action-feedback";
import { ActionNotice } from "./action-notice";
import { prepareDownload } from "@/lib/cv/download-flow";
import { deleteSubject } from "@/lib/cv/delete-flow";
import { DownloadPdfButton } from "../download-pdf-button";
import { ClarificationPanel } from "./clarification-panel";
import { CompletenessCard } from "./completeness-card";
import { EditorMenu } from "./editor-menu";
import { EditorNav } from "./editor-nav";
import { FullscreenPreview } from "./fullscreen-preview";
import { PreviewPanel } from "./preview-panel";
import { keyboardOpen, stickyAction, type MobileView } from "@/lib/cv/mobile-view";
import { saveView } from "@/lib/cv/save-view";
import { ConflictReview } from "./conflict-review";
import { SaveIndicator } from "./save-indicator";
import { ConflictNotice, SaveErrorNotice } from "./save-problems";
import { Education } from "./sections/education";
import { Experience } from "./sections/experience";
import { PersonalDetails } from "./sections/personal-details";
import { Skills } from "./sections/skills";
import { Summary } from "./sections/summary";
import { useCvEditor } from "./use-cv-editor";

/**
 * The structured editor: sticky navigation, then every section always open in the left column
 * and the live A4 preview sticky beside it (a tab switch on phones). All state lives in
 * `useCvEditor`; this component only arranges the pieces.
 */
export function EditorWorkspace({
  cvId,
  result,
  notice,
  appliedQuestionId,
  fetchLatest,
  onReplace,
}: {
  cvId: string;
  result: CvResult;
  /** A message from the previous action (for example "Answer applied"), shown once. */
  notice: string | null;
  appliedQuestionId: string | null;
  fetchLatest: () => Promise<CvResult>;
  onReplace: (result: CvResult, notice?: string, appliedQuestionId?: string) => void;
}) {
  const editor = useCvEditor({ cvId, result, fetchLatest, onReplace });
  const { form, saveState, draft, targetRole, invalid, autosaver } = editor;
  const [view, setView] = useState<MobileView>("editor");
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const offline = useOffline();
  const [retrying, setRetrying] = useState(false);
  // The notice stays while a retry runs, so "Retrying connection…" is visible; any outcome ends it.
  // (State adjusted while rendering, as React recommends, not in an effect.)
  const [seenStatus, setSeenStatus] = useState(saveState.status);
  if (seenStatus !== saveState.status) {
    setSeenStatus(saveState.status);
    if (saveState.status !== "saving") {
      setRetrying(false);
    }
  }
  const retry = () => {
    setRetrying(true);
    autosaver.retry();
  };
  const expandRef = useRef<HTMLButtonElement>(null);

  const name = draft.contact.fullName;
  const editorPane = view === "editor" ? "flex" : "hidden lg:flex";
  const previewPane = view === "preview" ? "flex" : "hidden lg:flex";

  return (
    <FormProvider {...form}>
      <div className="flex flex-1 flex-col">
        <EditorNav
          title={targetRole}
          owner={`${name ?? "Untitled CV"} · Personal CV`}
          status={
            <SaveIndicator
              state={saveState}
              invalid={invalid}
              onRetry={retry}
              onReview={() => void editor.openReview()}
            />
          }
          actions={
            <>
              <DownloadPdfButton
                cvId={cvId}
                size="regular"
                label={
                  <>
                    <span className="hidden sm:inline">Download PDF</span>
                    <span className="sm:hidden">PDF</span>
                  </>
                }
                onMessage={setDownloadMessage}
                beforeDownload={() =>
                  prepareDownload({
                    blockedReason: invalid ? "Fix the highlighted fields first, then download the PDF." : null,
                    flush: () => autosaver.flush(),
                  })
                }
              />
              <EditorMenu cvId={cvId} subject={deleteSubject({ candidateName: name, targetRole })} />
            </>
          }
        />

        <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 px-4 pt-4 pb-28 sm:px-8 lg:flex-row lg:items-start lg:gap-8 lg:py-8">
          {/* Phone: the intro, then Edit / Preview as a pair of 44 px buttons (Figma 05.2). */}
            <div className="flex flex-col gap-1.5 lg:hidden">
              <h2 className="text-2xl leading-[normal] font-semibold text-ink">Make it yours</h2>
              <p className="text-xs leading-normal text-muted">
                {saveView(saveState, invalid).intro}
              </p>
            </div>
          <div role="tablist" aria-label="View" className="grid grid-cols-2 gap-2 lg:hidden">
            {(["editor", "preview"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={view === tab}
                onClick={() => setView(tab)}
                className={`h-11 rounded-lg border text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  view === tab ? "border-accent bg-accent text-white" : "border-line bg-surface text-accent"
                }`}
              >
                {tab === "editor" ? "Edit" : "Preview"}
              </button>
            ))}
          </div>

          <div className={`${editorPane} min-w-0 flex-col gap-4 lg:w-[584px] lg:shrink-0`}>
            <div className="hidden flex-col gap-1.5 lg:flex">
              <h2 className="text-[22px] leading-[normal] font-semibold text-ink">Make it yours</h2>
              <p className="text-xs leading-normal text-muted">
                {saveView(saveState, invalid).intro}
              </p>
            </div>

            {downloadMessage ? (
              <p role="alert" className="rounded-lg bg-danger-tint p-3 text-[13px] text-danger">
                <span className="font-medium">Error: </span>
                {downloadMessage}
              </p>
            ) : null}
            {saveState.status === "error" || (retrying && saveState.status === "saving") ? (
              <SaveErrorNotice
                offline={offline}
                retrying={retrying && saveState.status === "saving"}
                onRetry={retry}
              />
            ) : null}
            {saveState.status === "conflict" && saveState.failure ? (
              <ConflictNotice
                failure={saveState.failure}
                busy={editor.conflictBusy}
                error={editor.conflictError}
                onReview={() => void editor.openReview()}
              />
            ) : null}
            {notice ? (
              <ActionNotice key={notice} message={notice} transient={notice === ANSWER_APPLIED_NOTICE} />
            ) : null}

            <CompletenessCard values={editor.values} />
            <ClarificationPanel
              cvId={cvId}
              initialQuestions={result.questions}
              appliedQuestionId={appliedQuestionId}
              draft={draft}
              onApply={editor.handleApply}
              onReviewLatest={editor.reviewLatest}
              applyDisabled={editor.applying}
            />
            {/* While an apply runs the form is read-only, so nothing is typed over the server's result. */}
            <fieldset disabled={editor.applying} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
              <PersonalDetails />
              <Summary />
              <Experience />
              <Skills />
              <Education />
            </fieldset>
            <p className="text-xs leading-normal text-muted">
              You’re in control. Review wording, dates and claims before downloading.
            </p>
          </div>

          {/* One vertical scroll container for the sticky preview, including tall documents. */}
          <div className={`${previewPane} min-w-0 flex-1 flex-col lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto`}>
            <PreviewPanel
              draft={draft}
              targetRole={targetRole}
              saveStatus={saveState.status}
              invalid={invalid}
              onOpenFullscreen={() => setFullscreen(true)}
              expandRef={expandRef}
            />
          </div>
        </main>
      </div>
      <PreviewBar view={view} onSwitch={setView} />
      {editor.review ? (
        <ConflictReview
          local={{ targetRole, draft }}
          saved={{ targetRole: editor.review.targetRole, draft: editor.review.draft }}
          onKeepMine={editor.keepMine}
          onUseSaved={editor.useSaved}
          onClose={editor.closeReview}
        />
      ) : null}
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

/**
 * The phone's sticky action (Figma 05.2, 11.2): "Preview CV" while editing, "Edit CV" while
 * previewing. Its bottom padding is 16 px plus the safe-area inset, and it hides while the on-screen
 * keyboard is open so the field being typed in stays above the keyboard.
 */
function PreviewBar({ view, onSwitch }: { view: MobileView; onSwitch: (view: MobileView) => void }) {
  const [typing, setTyping] = useState(false);
  const action = stickyAction(view);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null) {
      return;
    }
    const update = () => setTyping(keyboardOpen(window.innerHeight, viewport.height));
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);

  if (typing) {
    return null;
  }
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden">
      <button
        type="button"
        onClick={() => {
          onSwitch(action.next);
          window.scrollTo({ top: 0 });
        }}
        className="h-11 w-full rounded-lg border border-accent bg-accent text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {action.label}
      </button>
    </div>
  );
}

/** Whether the browser reports no connection (the notice then says "Offline"). */
function useOffline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    () => !navigator.onLine,
    () => false,
  );
}
