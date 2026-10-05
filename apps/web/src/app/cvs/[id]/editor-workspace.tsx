"use client";

import { useRef, useState } from "react";
import { FormProvider } from "react-hook-form";
import type { CvResult } from "@/lib/api/cvs";
import { prepareDownload } from "@/lib/cv/download-flow";
import { deleteSubject } from "@/lib/cv/delete-flow";
import { DownloadPdfButton } from "../download-pdf-button";
import { ClarificationPanel } from "./clarification-panel";
import { CompletenessCard } from "./completeness-card";
import { EditorMenu } from "./editor-menu";
import { EditorNav } from "./editor-nav";
import { FullscreenPreview } from "./fullscreen-preview";
import { PreviewPanel } from "./preview-panel";
import { SaveIndicator } from "./save-indicator";
import { ConflictBanner, SaveErrorMessage } from "./save-problems";
import { Education } from "./sections/education";
import { Experience } from "./sections/experience";
import { PersonalDetails } from "./sections/personal-details";
import { SkillsShell } from "./sections/skills-shell";
import { Summary } from "./sections/summary";
import { useCvEditor } from "./use-cv-editor";

type MobileView = "editor" | "preview";

/**
 * The structured editor: sticky navigation, then every section always open in the left column
 * and the live A4 preview sticky beside it (a tab switch on phones). All state lives in
 * `useCvEditor`; this component only arranges the pieces.
 */
export function EditorWorkspace({
  cvId,
  result,
  notice,
  fetchLatest,
  onReplace,
}: {
  cvId: string;
  result: CvResult;
  /** A message from the previous action (for example "Answer applied"), shown once. */
  notice: string | null;
  fetchLatest: () => Promise<CvResult>;
  onReplace: (result: CvResult, notice?: string) => void;
}) {
  const editor = useCvEditor({ cvId, result, fetchLatest, onReplace });
  const { form, saveState, draft, targetRole, invalid, autosaver } = editor;
  const [view, setView] = useState<MobileView>("editor");
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
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
          status={<SaveIndicator state={saveState} invalid={invalid} />}
          actions={
            <>
              <DownloadPdfButton
                cvId={cvId}
                size="regular"
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

        <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-4 px-4 py-5 sm:px-8 lg:flex-row lg:items-start lg:gap-8 lg:py-8">
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

          <div className={`${editorPane} min-w-0 flex-col gap-4 lg:w-[584px] lg:shrink-0`}>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] leading-[normal] font-semibold text-ink">Make it yours</h2>
              <p className="text-xs leading-normal text-muted">
                Edit your details. The document preview follows your changes.
              </p>
            </div>

            {downloadMessage ? (
              <p role="alert" className="rounded-lg bg-danger-tint p-3 text-[13px] text-danger">
                <span className="font-medium">Error: </span>
                {downloadMessage}
              </p>
            ) : null}
            {saveState.status === "error" ? <SaveErrorMessage onRetry={() => autosaver.retry()} /> : null}
            {saveState.status === "conflict" && saveState.failure ? (
              <ConflictBanner
                failure={saveState.failure}
                busy={editor.conflictBusy}
                error={editor.conflictError}
                onLoadLatest={() => void editor.resolveConflict(false)}
                onKeepMine={() => void editor.resolveConflict(true)}
              />
            ) : null}
            {notice ? (
              <p role="status" className="rounded-lg bg-canvas p-3 text-[13px] leading-normal text-ink">
                {notice}
              </p>
            ) : null}

            <CompletenessCard values={editor.values} />
            <ClarificationPanel
              cvId={cvId}
              initialQuestions={result.questions}
              draft={draft}
              onApply={editor.handleApply}
              applyDisabled={editor.applying}
            />
            {/* While an apply runs the form is read-only, so nothing is typed over the server's result. */}
            <fieldset disabled={editor.applying} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
              <PersonalDetails />
              <Summary />
              <Experience />
              <SkillsShell />
              <Education />
            </fieldset>
            <p className="text-xs leading-normal text-muted">
              You’re in control. Review wording, dates and claims before downloading.
            </p>
          </div>

          {/* Sticky on desktop; the panel scrolls inside when the sheet is taller than the window. */}
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
