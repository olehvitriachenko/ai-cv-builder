"use client";

import { ChevronLeft, FileText, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { closeEditorDialog } from "@/shared/lib/dialog-motion";
import type { CvDraft } from "@/entities/cv/schemas";
import type { SaveStatus } from "@/features/cv-editor/model/autosave";
import {
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  estimatePages,
  fitScale,
  previewStatus,
  zoomIn,
  zoomOut,
} from "@/features/cv-editor/lib/preview-zoom";
import { DownloadPdfButton } from "../../../pdf-download/components/download-pdf-button";
import { PdfPreparationDialog } from "../../../pdf-download/components/pdf-preparation-dialog";
import { expectedPdfFilename } from "../../../pdf-download/model/pdf-filename";
import { PAGE_HEIGHT, ScaledSheet } from "./scaled-sheet";
import { ZoomControls } from "./zoom-controls";

/**
 * The full-screen preview (Figma 10.2 to 10.4) on a native modal `<dialog>`: the browser traps
 * focus, closes it on Esc and blurs/dims the editor behind it through `::backdrop`. It keeps its
 * own zoom (the inline preview is untouched) and reuses the editor's Download PDF flow, so pending
 * edits are saved first. Render it only while open: each opening starts at the sheet width (100% on a wide screen).
 */
export function FullscreenPreview({
  cvId,
  draft,
  targetRole,
  saveStatus,
  invalid,
  beforeDownload,
  onClose,
}: {
  cvId: string;
  draft: CvDraft;
  targetRole: string;
  saveStatus: SaveStatus;
  invalid: boolean;
  beforeDownload: () => Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const backdropPress = useRef(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [height, setHeight] = useState(PAGE_HEIGHT);

  // No cleanup on purpose: removing an open modal dialog from the DOM already closes it, while
  // calling `close()` here would fire `onClose` and, under React Strict Mode's mount-unmount-mount
  // in development, close the dialog again right after it opened.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      // showModal focuses the first control, which would draw a focus ring on "Close preview" before
      // anyone pressed a key. The dialog itself takes focus instead; Tab reaches the controls.
      dialog.focus();
    }
  }, []);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) {
      return;
    }
    const measure = () => setArea({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The preview opens at the full sheet width (100% when the screen is wide enough) and scrolls
  // down the pages; "Fit page" shows the whole page: the smaller of the width fit and the height fit.
  const fitWidth = fitScale(area.width - 32, A4_WIDTH_PX);
  const fitWholePage = Math.min(fitWidth, fitScale(area.height - 24, A4_HEIGHT_PX));
  const zoom = manualZoom ?? fitWidth;
  const pages = estimatePages(height, PAGE_HEIGHT);
  const status = previewStatus({ saveStatus, invalid });
  const onHeight = useCallback((next: number) => setHeight(next), []);

  const fitPage = (
    <Button
      type="button"
      variant="secondary"
      size="compact"
      stretch={false}
      onClick={() => setManualZoom(fitWholePage)}
      className="max-sm:h-11 max-sm:border-accent-line max-sm:bg-accent-tint max-sm:px-4 max-sm:text-sm max-sm:text-accent"
    >
      Fit page
    </Button>
  );

  const floatingMessage =
    "[&>p]:absolute [&>p]:top-full [&>p]:right-0 [&>p]:z-10 [&>p]:mt-2 [&>p]:w-72 [&>p]:max-w-[calc(100vw-2rem)]";

  return (
    <dialog
      ref={dialogRef}
      aria-label="Fullscreen preview"
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); closeEditorDialog(dialogRef.current); }}
      tabIndex={-1}
      className="cv-editor-motion m-0 outline-none h-dvh max-h-none w-dvw max-w-none overflow-hidden bg-transparent p-0 text-ink backdrop:bg-[rgba(32,39,53,0.14)] backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full flex-col">
        {/* Desktop navigation (10.2) */}
        <header className="hidden h-[72px] shrink-0 items-center gap-6 border-b border-line bg-surface px-8 sm:flex">
          <div className="flex items-center gap-[9px]">
            <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-accent">
              <FileText className="size-[19px] text-white" strokeWidth={1.75} />
            </span>
            <span className="text-[21px] leading-none font-bold text-ink">forma</span>
          </div>
          <div aria-hidden className="h-6 w-px bg-line" />
          <div className="flex min-w-0 flex-1 flex-col gap-[3px] [overflow-wrap:anywhere]">
            <h1 className="text-sm font-semibold text-ink">Fullscreen preview</h1>
            <p className="truncate text-[11px] text-muted">{targetRole} · Classic · A4</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="text-[11px] text-muted">
              Esc
            </span>
            <button
              type="button"
              aria-label="Close preview"
              title="Close preview"
              onClick={() => closeEditorDialog(dialogRef.current)}
              className="flex size-9 items-center justify-center rounded-lg text-accent hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X aria-hidden className="size-4" strokeWidth={2} />
            </button>
          </div>
          <div className={`relative ${floatingMessage}`}>
            <DownloadPdfButton
              cvId={cvId}
              size="regular"
              beforeDownload={beforeDownload}
              onBusyChange={setPreparing}
              busyLabel="Preparing…"
            />
          </div>
        </header>

        {/* Phone navigation (10.3, 10.4) */}
        <header className="flex h-[76px] shrink-0 items-center gap-2.5 border-b border-line bg-surface p-4 sm:hidden">
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => closeEditorDialog(dialogRef.current)}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-canvas text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <ChevronLeft aria-hidden className="size-5" strokeWidth={2} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="flex size-5 items-center justify-center rounded-md bg-accent">
                <FileText className="size-3 text-white" strokeWidth={1.75} />
              </span>
              <span className="text-[17px] leading-none font-bold text-ink">forma</span>
            </div>
            <h1 className="text-[11px] font-normal text-muted">Fullscreen preview</h1>
          </div>
          <div className={`relative ${floatingMessage}`}>
            <DownloadPdfButton
              cvId={cvId}
              size="regular"
              variant="text"
              showIcon
              label="PDF"
              busyLabel="PDF"
              beforeDownload={beforeDownload}
              onBusyChange={setPreparing}
            />
          </div>
        </header>

        {/* Phone document identity */}
        <div className="flex shrink-0 flex-col gap-[5px] bg-stage px-4 pt-5 pb-3 sm:hidden">
          <p className="text-[13px] font-medium break-words text-ink">{targetRole}</p>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>Classic · A4</span>
            <span>{status.short}</span>
          </div>
        </div>

        <div
          ref={stageRef}
          onPointerDown={(event) => {
            backdropPress.current = event.button === 0 && event.target === event.currentTarget;
          }}
          onClick={(event) => {
            if (backdropPress.current && event.target === event.currentTarget) closeEditorDialog(dialogRef.current);
            backdropPress.current = false;
          }}
          className="flex min-h-0 flex-1 flex-col overflow-auto bg-stage px-4 py-3 sm:bg-transparent sm:px-8 sm:py-[21px]"
        >
          <div className="m-auto flex flex-col items-center gap-4">
            <div className="shadow-[0_6px_24px_rgba(32,39,53,0.12)] sm:shadow-[0_8px_28px_rgba(40,51,71,0.08)]">
              <ScaledSheet draft={draft} targetRole={targetRole} zoom={zoom} height={height} onHeight={onHeight} />
            </div>
            <p className="text-xs text-muted sm:hidden">
              Page 1 of {pages}
            </p>
          </div>
        </div>

        {/* Desktop viewing controls (10.2) */}
        <div className="hidden shrink-0 items-center justify-between self-center pb-4 sm:flex sm:w-[660px] sm:max-w-full sm:px-0">
          <p className="text-[11px] text-muted">
            {status.short} · {status.detail}
          </p>
          <div className="flex items-center gap-3">
            <p className="text-xs text-ink">Page 1 of {pages}</p>
            <ZoomControls
              zoom={zoom}
              size="bar"
              onZoomIn={() => setManualZoom(zoomIn(zoom))}
              onZoomOut={() => setManualZoom(zoomOut(zoom))}
            />
            {fitPage}
          </div>
        </div>

        {/* Phone viewing controls (10.3, 10.4) */}
        <div className="flex shrink-0 flex-col items-center gap-2.5 bg-stage px-4 pt-3 pb-6 sm:hidden">
          <div className="flex items-center gap-2">
            <ZoomControls
              zoom={zoom}
              size="touch"
              onZoomIn={() => setManualZoom(zoomIn(zoom))}
              onZoomOut={() => setManualZoom(zoomOut(zoom))}
            />
            {fitPage}
          </div>
          <p className="text-[11px] text-muted">{status.detail}</p>
        </div>
      </div>
      <PdfPreparationDialog
        preparing={preparing}
        filename={expectedPdfFilename(draft.contact.fullName, targetRole)}
      />
    </dialog>
  );
}
