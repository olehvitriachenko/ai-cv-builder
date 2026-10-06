"use client";

import { useEffect, useRef, useState } from "react";
import type { CvDraft } from "@/entities/cv/schemas";
import { SHEET_WIDTH_PX, sheetScale } from "@/features/cv-editor/lib/preview-zoom";
import { CvDocument } from "./cv-document";

export const PAGE_HEIGHT = 933;
export const PAGE_GAP = 24;
const PAGE_PADDING = 32;

/** Measure the flowing document, then show its non-overlapping slices on separate A4 sheets. */
export function ScaledSheet({
  draft, targetRole, zoom, onHeight,
}: {
  draft: CvDraft;
  targetRole: string;
  zoom: number;
  height: number;
  onHeight: (height: number) => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const report = useRef(onHeight);
  const [slices, setSlices] = useState([{ start: 0, end: PAGE_HEIGHT }]);

  useEffect(() => { report.current = onHeight; }, [onHeight]);

  useEffect(() => {
    const element = sheetRef.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const origin = element.getBoundingClientRect().top;
      const lines: { top: number; bottom: number }[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.height) lines.push({ top: rect.top - origin, bottom: rect.bottom - origin });
        }
      }
      const total = element.offsetHeight;
      const next: { start: number; end: number }[] = [];
      let start = 0;
      while (start < total) {
        let end = Math.min(total, start + PAGE_HEIGHT - (start === 0 ? 0 : PAGE_PADDING * 2));
        // Move a boundary above any text line it would intersect. No line is clipped or repeated.
        let crossing = lines.filter((line) => line.top < end && line.bottom > end);
        while (crossing.length) {
          const boundary = Math.min(...crossing.map((line) => line.top));
          if (boundary <= start || boundary >= end) break;
          end = boundary;
          crossing = lines.filter((line) => line.top < end && line.bottom > end);
        }
        next.push({ start, end });
        start = end;
      }
      if (!next.length) next.push({ start: 0, end: PAGE_HEIGHT });
      setSlices((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      report.current(next.length * PAGE_HEIGHT);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts.ready.then(measure);
    return () => { active = false; observer.disconnect(); };
  }, [draft, targetRole]);

  const factor = sheetScale(zoom);
  return (
    <div className="relative flex shrink-0 flex-col" style={{ width: SHEET_WIDTH_PX * factor, gap: PAGE_GAP }}>
      <div className="pointer-events-none absolute top-0 left-0 size-0 overflow-hidden opacity-0">
        <div ref={sheetRef} style={{ width: SHEET_WIDTH_PX }}>
          <CvDocument draft={draft} targetRole={targetRole} fixed />
        </div>
      </div>
      {slices.map((slice, index) => (
        <div key={index} aria-hidden className="relative overflow-hidden bg-surface shadow-[0_8px_28px_rgba(40,51,71,0.08)]" style={{ height: PAGE_HEIGHT * factor }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: SHEET_WIDTH_PX, height: PAGE_HEIGHT, transform: `scale(${factor})` }}>
            <div className="absolute inset-x-0 overflow-hidden" style={{ top: index === 0 ? 0 : PAGE_PADDING, height: slice.end - slice.start }}>
              <div style={{ transform: `translateY(${-slice.start}px)` }}>
                <CvDocument draft={draft} targetRole={targetRole} fixed />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
