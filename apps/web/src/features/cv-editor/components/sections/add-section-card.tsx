"use client";

import { useEditorMotion } from "@/shared/lib/use-editor-motion";
import type { PredefinedKind } from "@/features/cv-editor/model/optional-sections";

const PLUS = "flex shrink-0 items-center justify-center rounded-full font-bold text-white";

/**
 * "Section card / Add a section". From `sm` (Figma 112:4845): the options two per row with the plus
 * mark first, and "+ Custom Section" as a text button. On a phone (Figma 112:4920): one row per option
 * with the label first and a round plus at the right, and "Custom Section" as the last row in the
 * accent colour.
 */
export function AddSectionCard({
  options,
  canAddCustom,
  onAdd,
  onAddCustom,
}: {
  options: readonly { kind: PredefinedKind; label: string }[];
  canAddCustom: boolean;
  onAdd: (kind: PredefinedKind) => void;
  onAddCustom: () => void;
}) {
  const listRef = useEditorMotion<HTMLUListElement>();
  const row =
    "flex h-11 w-full items-center gap-3 rounded-lg border border-line text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:flex-row-reverse max-sm:justify-between max-sm:gap-2 max-sm:bg-surface max-sm:pr-2 max-sm:pl-3 sm:bg-canvas sm:px-4 sm:hover:border-accent-line sm:hover:bg-accent-tint";
  return (
    <section aria-label="Add a section" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:gap-4">
      <h3 className="text-base leading-[normal] font-semibold text-ink">Add a section</h3>
      <p className="text-xs leading-normal text-muted">
        <span className="max-sm:hidden">Extend your CV with optional sections. Only add what you can confirm.</span>
        <span className="sm:hidden">Enhance your CV with additional sections.</span>
      </p>
      <ul ref={listRef} className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-3 sm:[&:empty]:hidden">
        {options.map((option) => (
          <li key={option.kind} className="min-w-0">
            <button type="button" onClick={() => onAdd(option.kind)} className={`${row} text-ink`}>
              <span aria-hidden className={`${PLUS} size-7 bg-ink text-base font-normal sm:size-6 sm:text-sm sm:font-bold`}>
                +
              </span>
              {option.label}
            </button>
          </li>
        ))}
        {canAddCustom ? (
          <li className="min-w-0 sm:hidden">
            <button type="button" onClick={onAddCustom} className={`${row} text-accent`}>
              <span aria-hidden className={`${PLUS} size-7 bg-accent text-base font-normal`}>
                +
              </span>
              Custom Section
            </button>
          </li>
        ) : null}
      </ul>
      {canAddCustom ? (
        <button
          type="button"
          onClick={onAddCustom}
          className="flex h-11 items-center justify-center self-start rounded-lg px-4 text-sm font-semibold text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:hidden"
        >
          + Custom Section
        </button>
      ) : null}
    </section>
  );
}
