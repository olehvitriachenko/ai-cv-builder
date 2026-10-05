"use client";

import { Maximize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CvDraft } from "@/lib/api/cvs";
import type { SaveStatus } from "@/lib/cv/autosave";
import {
  A4_WIDTH_PX,
  DESIGN_ZOOM,
  estimatePages,
  fitScale,
  previewStatus,
  zoomIn,
  zoomOut,
} from "@/lib/cv/preview-zoom";
import { PAGE_HEIGHT, ScaledSheet } from "./scaled-sheet";
import { ZoomControls } from "./zoom-controls";

/**
 * The inline preview column (Figma 10.1): toolbar with the page count and zoom, the status line,
 * the sheet on its stage, and an "Open fullscreen" action that shows on hover and focus. The sheet
 * fits the stage until the person zooms; the page count is an estimate from the preview's height.
 */
export function PreviewPanel({
  draft,
  targetRole,
  saveStatus,
  invalid,
  onOpenFullscreen,
  expandRef,
}: {
  draft: CvDraft;
  targetRole: string;
  saveStatus: SaveStatus;
  invalid: boolean;
  /** Shows the "Open fullscreen" action when given. */
  onOpenFullscreen?: () => void;
  expandRef?: RefObject<HTMLButtonElement | null>;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [height, setHeight] = useState(PAGE_HEIGHT);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) {
      return;
    }
    const measure = () => setStageWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const zoom = manualZoom ?? Math.min(DESIGN_ZOOM, fitScale(stageWidth, A4_WIDTH_PX));
  const pages = estimatePages(height, PAGE_HEIGHT);
  const status = previewStatus({ saveStatus, invalid });
  const measured = stageWidth > 0;
  const onHeight = useCallback((next: number) => setHeight(next), []);

  return (
    <section aria-label="Live preview" className="flex min-w-0 flex-col gap-3">
      <div className="flex h-[34px] items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-ink">Preview</h2>
          <p className="text-[11px] text-muted">Classic · A4</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-muted">
            Page 1 of {pages}
          </p>
          <ZoomControls
            zoom={zoom}
            size="panel"
            onZoomIn={() => setManualZoom(zoomIn(zoom))}
            onZoomOut={() => setManualZoom(zoomOut(zoom))}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-xl bg-stage px-4 pt-4 pb-5 sm:px-6">
        <p className="text-center text-[11px] text-muted">
          {measured ? `${status.short} · ${status.detail}` : "Last saved version · Preview loading…"}
        </p>
        <div ref={stageRef} className="group relative flex w-full justify-center overflow-x-auto">
          <div className="relative">
            <div className="rounded-sm transition-shadow group-hover:shadow-[0_0_0_2px_rgba(69,73,190,0.2)] group-focus-within:shadow-[0_0_0_2px_rgba(69,73,190,0.2)]">
              {measured ? (
                <ScaledSheet draft={draft} targetRole={targetRole} zoom={zoom} height={height} onHeight={onHeight} />
              ) : (
                <PreviewSkeleton />
              )}
            </div>
            {onOpenFullscreen ? (
              <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                <span
                  aria-hidden
                  className="hidden h-11 items-center rounded-[10px] border border-line bg-surface px-5 text-[13px] font-semibold text-accent shadow-[0_6px_16px_rgba(40,51,71,0.08)] sm:flex"
                >
                  Open fullscreen
                </span>
                <button
                  ref={expandRef}
                  type="button"
                  aria-label="Open fullscreen preview"
                  onClick={onOpenFullscreen}
                  className="flex size-11 items-center justify-center rounded-lg border border-line bg-surface text-accent hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Maximize2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted">A clean, selectable-text PDF. No watermarks.</p>
      <p className="text-center text-[11px] text-muted">Preview stays in view while you edit.</p>
    </section>
  );
}

/** "Preview state / Loading" (Figma 11.1): a white sheet with grey bars until the stage is measured. */
function PreviewSkeleton() {
  return (
    <div aria-busy className="flex aspect-[660/933] w-[min(660px,100%)] min-w-[280px] flex-col gap-3.5 bg-surface p-10 shadow-[0_8px_28px_rgba(40,51,71,0.08)]">
      <span className="h-5 w-[170px] rounded bg-skeleton" />
      {Array.from({ length: 8 }, (_, index) => (
        <span key={index} className="h-2.5 w-full rounded-full bg-skeleton" />
      ))}
    </div>
  );
}
