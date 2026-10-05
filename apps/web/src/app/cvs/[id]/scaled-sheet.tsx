"use client";

import { useEffect, useRef } from "react";
import type { CvDraft } from "@/lib/api/cvs";
import { CvDocument } from "./cv-document";

/** The A4 sheet at 100%: 660 px wide, 933 px tall (the ratio the preview is drawn at). */
export const SHEET_WIDTH = 660;
export const PAGE_HEIGHT = 933;

/**
 * The CV sheet at a zoom level. The sheet is always laid out at its real 660 px width and scaled
 * with a CSS transform, so zooming never reflows the text; the wrapper takes the scaled size so
 * the page layout and scrolling follow it. `onHeight` reports the unscaled height (the content can
 * be taller than one page), and faint guides mark where each further A4 page would start.
 */
export function ScaledSheet({
  draft,
  targetRole,
  zoom,
  height,
  onHeight,
}: {
  draft: CvDraft;
  targetRole: string;
  zoom: number;
  height: number;
  onHeight: (height: number) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const report = useRef(onHeight);

  useEffect(() => {
    report.current = onHeight;
  }, [onHeight]);

  useEffect(() => {
    const element = sheetRef.current;
    if (!element) {
      return;
    }
    const measure = () => report.current(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const factor = zoom / 100;
  const guides = Math.max(0, Math.ceil((height - 2) / PAGE_HEIGHT) - 1);

  return (
    <div className="relative shrink-0" style={{ width: SHEET_WIDTH * factor, height: height * factor }}>
      <div
        ref={sheetRef}
        className="relative origin-top-left"
        style={{ width: SHEET_WIDTH, transform: `scale(${factor})` }}
      >
        <CvDocument draft={draft} targetRole={targetRole} fixed />
        {Array.from({ length: guides }, (_, index) => (
          <div
            key={index}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line"
            style={{ top: PAGE_HEIGHT * (index + 1) }}
          />
        ))}
      </div>
    </div>
  );
}
