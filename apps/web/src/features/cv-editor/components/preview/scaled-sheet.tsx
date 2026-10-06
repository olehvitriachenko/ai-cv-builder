"use client";

import { useEffect, useRef } from "react";
import type { CvDraft } from "@/entities/cv/schemas";
import { SHEET_WIDTH_PX, sheetScale } from "@/lib/cv/preview-zoom";
import { CvDocument } from "./cv-document";

/** The layout sheet: 660 px wide and 933 px tall, the ratio of A4 (Figma "A4 CV page"). */
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

  const factor = sheetScale(zoom);
  const guides = Math.max(0, Math.ceil((height - 2) / PAGE_HEIGHT) - 1);
  const owner = draft.contact.fullName?.toUpperCase() ?? "";

  return (
    <div className="relative shrink-0" style={{ width: SHEET_WIDTH_PX * factor, height: height * factor }}>
      <div
        ref={sheetRef}
        className="relative origin-top-left"
        style={{ width: SHEET_WIDTH_PX, transform: `scale(${factor})` }}
      >
        <CvDocument draft={draft} targetRole={targetRole} fixed />
        {/* "Document footer": the name and the page number, 29 px above the bottom of every A4 page. */}
        {Array.from({ length: guides + 1 }, (_, index) => (
          <div
            key={`footer-${index}`}
            aria-hidden
            className="pointer-events-none absolute right-[54px] left-[54px] flex justify-between text-[8px] leading-[normal] text-paper-muted"
            style={{ top: PAGE_HEIGHT * (index + 1) - 29 - 10 }}
          >
            <span>{owner}</span>
            <span>{index + 1}</span>
          </div>
        ))}
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
