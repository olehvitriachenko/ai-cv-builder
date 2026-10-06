"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Button } from "@/shared/ui/button";
import { FieldFrame, describedBy } from "@/shared/ui/field";
import { MONTHS, parseCvDate } from "@/features/cv-editor/lib/dates";
import {
  canPageBack,
  canPageForward,
  formatPicked,
  initialYear,
  monthDisabled,
  selectedLabel,
  withYear,
  yearDisabled,
  yearPageStart,
  yearsOnPage,
  YEARS_PER_PAGE,
  type DateBounds,
} from "@/features/cv-editor/lib/date-picker";
import type { CvDate } from "@/features/cv-editor/lib/dates";
import { CheckboxRow } from "./checkbox-row";

/** Room the picker needs above its field; with less it opens below the field instead. */
const PANEL_HEIGHT = 560;

export interface CurrentToggle {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * "Forma / Date field" with its month picker (Figma 06.3, 06.5): a field that shows the date and
 * opens a picker instead of taking typed text. The picker is an anchored popup from `sm` up and a
 * bottom sheet on a phone. What the person picks stays a draft until Apply; Cancel, Escape and a
 * press outside leave the date as it was. `lockedText` shows a fixed value ("Present") that cannot
 * be opened, and `current` adds the "currently here" checkbox that decides it.
 */
export function DatePicker({
  label,
  value,
  onChange,
  bounds,
  precision = "month",
  error,
  hint,
  lockedText,
  current,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  bounds: DateBounds;
  precision?: "month" | "year";
  error?: string;
  hint?: string;
  lockedText?: string;
  current?: CurrentToggle;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("above");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function openPicker() {
    const top = wrapperRef.current?.getBoundingClientRect().top ?? 0;
    setPlacement(top >= PANEL_HEIGHT ? "above" : "below");
    setOpen(true);
  }

  function closePicker() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const placeholder = precision === "year" ? "Select year" : "Select date";
  const shown = value.trim();

  if (lockedText !== undefined) {
    return (
      <FieldFrame label={label} controlId={id} hint={hint} error={error}>
        <button
          id={id}
          type="button"
          disabled
          className="flex h-11 w-full cursor-not-allowed items-center rounded-lg border border-line bg-canvas px-3 text-left text-sm text-muted"
        >
          {lockedText}
        </button>
      </FieldFrame>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <FieldFrame label={label} controlId={id} hint={hint} error={error}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-describedby={describedBy(id, hint, error)}
          onClick={() => (open ? closePicker() : openPicker())}
          className={`flex h-11 w-full items-center justify-between rounded-lg bg-surface pl-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            open
              ? "border-2 border-accent pl-[11px] shadow-[0_0_0_3px_#dcddf5]"
              : error
                ? "border-[1.5px] border-danger"
                : "border border-line"
          } ${shown === "" ? "text-placeholder" : "text-ink"}`}
        >
          <span className="min-w-0 flex-1 truncate">{shown === "" ? placeholder : shown}</span>
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center text-muted">
            <CalendarDays className="size-[18px]" strokeWidth={1.75} />
          </span>
        </button>
      </FieldFrame>
      {open ? (
        <DatePickerPanel
          title={label}
          value={shown}
          precision={precision}
          bounds={bounds}
          placement={placement}
          current={current}
          triggerRef={triggerRef}
          onApply={(next) => {
            if (next !== null) onChange(next);
          }}
          onClose={closePicker}
        />
      ) : null}
    </div>
  );
}

function DatePickerPanel({
  title,
  value,
  precision,
  bounds,
  placement,
  current,
  triggerRef,
  onApply,
  onClose,
}: {
  title: string;
  value: string;
  precision: "month" | "year";
  bounds: DateBounds;
  placement: "above" | "below";
  current: CurrentToggle | undefined;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onApply: (value: string | null) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const parsed = parseCvDate(value);
  const startYear = initialYear(parsed, bounds);
  const [view, setView] = useState<"months" | "years">(precision === "year" ? "years" : "months");
  const [year, setYear] = useState(startYear);
  const [pageStart, setPageStart] = useState(() => yearPageStart(startYear, bounds));
  const [selected, setSelected] = useState<CvDate | null>(
    parsed && precision === "year" ? { year: parsed.year, month: null } : parsed,
  );
  const [isCurrent, setIsCurrent] = useState(current?.checked ?? false);

  // Focus moves into the picker (the chosen tile, else the first free one) and Tab can leave it.
  useEffect(() => {
    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>("[data-tile][aria-pressed='true']:not(:disabled)") ??
      panel?.querySelector<HTMLElement>("[data-tile]:not(:disabled)");
    target?.focus();
    panel?.scrollIntoView({ block: "nearest" });
  }, []);

  // Escape leaves the date as it was, wherever focus is (it can sit on <body> after a view change).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // A press outside leaves the date as it was.
  useEffect(() => {
    function onPress(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [onClose, triggerRef]);

  // Switching between months and years unmounts the tile that had focus: put it on a tile again.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    panelRef.current?.querySelector<HTMLElement>("[data-tile][aria-pressed='true']:not(:disabled), [data-tile]:not(:disabled)")?.focus();
  }, [view]);

  const currentChanged = current !== undefined && isCurrent !== current.checked;
  const canApply = selected !== null || currentChanged;

  function apply() {
    onApply(selected ? formatPicked(selected) : null);
    // Applied after the date, so "currently here" wins over a date picked in the same visit.
    if (currentChanged) current?.onChange(isCurrent);
    onClose();
  }

  function pickYear(next: number) {
    if (precision === "year") {
      setSelected({ year: next, month: null });
      return;
    }
    setSelected(withYear(selected, next, bounds));
    setYear(next);
    setView("months");
  }

  function openYears() {
    setPageStart(yearPageStart(year, bounds));
    setView("years");
  }

  const inYears = view === "years";
  const canBack = inYears ? canPageBack(pageStart, bounds) : year > bounds.min.year;
  const canForward = inYears ? canPageForward(pageStart, bounds) : year < bounds.max.year;
  const step = (direction: -1 | 1) =>
    inYears ? setPageStart(pageStart + direction * YEARS_PER_PAGE) : setYear(year + direction);

  const navButton = "flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-placeholder disabled:opacity-50 disabled:hover:bg-surface";
  const tile = (picked: boolean) =>
    `h-11 rounded-lg text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
      picked ? "bg-accent font-semibold text-white" : "bg-surface text-ink hover:bg-canvas disabled:hover:bg-surface"
    }`;

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-[rgba(24,34,48,0.4)] sm:hidden" />
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby={headingId}
        className={`z-50 flex flex-col gap-3 border border-line bg-surface p-4 shadow-[0_8px_28px_rgba(40,51,71,0.08)] max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:gap-2.5 max-sm:rounded-t-xl max-sm:border-b-0 max-sm:pt-2 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:absolute sm:left-0 sm:w-[328px] sm:rounded-xl ${
          placement === "above" ? "sm:bottom-full sm:mb-2" : "sm:top-full sm:mt-2"
        }`}
      >
        <span aria-hidden className="mx-auto h-1 w-9 rounded-full bg-line sm:hidden" />
        <div className="flex flex-col gap-1">
          <p id={headingId} className="text-base leading-[normal] font-semibold text-ink">
            {title}
          </p>
          <p className="text-[11px] leading-normal text-muted max-sm:hidden">
            {precision === "year" ? "Select a year" : "Select a month and year"}
          </p>
        </div>

        <div className="flex h-11 items-center gap-2">
          <button type="button" aria-label={inYears ? "Previous years" : "Previous year"} disabled={!canBack} onClick={() => step(-1)} className={navButton}>
            <ChevronLeft aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </button>
          {precision === "year" ? (
            <p aria-live="polite" className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg border border-line text-sm font-semibold text-ink">
              {pageStart}–{pageStart + YEARS_PER_PAGE - 1}
            </p>
          ) : (
            <button
              type="button"
              aria-expanded={inYears}
              aria-label={inYears ? `Choose a year, showing ${pageStart} to ${pageStart + YEARS_PER_PAGE - 1}` : `Year ${year}, choose another`}
              onClick={() => (inYears ? setView("months") : openYears())}
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {inYears ? `${pageStart}–${pageStart + YEARS_PER_PAGE - 1}` : year}
              <ChevronDown aria-hidden className={`size-3.5 transition-transform ${inYears ? "rotate-180" : ""}`} strokeWidth={1.75} />
            </button>
          )}
          <button type="button" aria-label={inYears ? "Next years" : "Next year"} disabled={!canForward} onClick={() => step(1)} className={navButton}>
            <ChevronRight aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {inYears
            ? yearsOnPage(pageStart).map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  data-tile
                  aria-pressed={selected?.year === candidate}
                  disabled={yearDisabled(candidate, bounds)}
                  onClick={() => pickYear(candidate)}
                  className={tile(selected?.year === candidate)}
                >
                  {candidate}
                </button>
              ))
            : MONTHS.map((name, index) => {
                const month = index + 1;
                const picked = selected?.year === year && selected.month === month;
                return (
                  <button
                    key={name}
                    type="button"
                    data-tile
                    aria-pressed={picked}
                    disabled={monthDisabled(year, month, bounds)}
                    onClick={() => setSelected({ year, month })}
                    className={tile(picked)}
                  >
                    {name}
                  </button>
                );
              })}
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-[#f2f2fd] p-3">
          <p className="min-w-0 flex-1 text-xs leading-[normal] text-muted">Selected</p>
          <p className="shrink-0 text-[13px] leading-[normal] font-semibold text-accent">
            {selected ? selectedLabel(selected) : "Not selected"}
          </p>
        </div>

        {current ? (
          <div className="max-sm:hidden">
            <CheckboxRow label={current.label} checked={isCurrent} onChange={setIsCurrent} />
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-normal text-muted">
            <span className="max-sm:hidden">
              {precision === "year" ? "Year precision only" : "Month precision only · No exact day"}
            </span>
            <span className="sm:hidden">Changes stay in draft until Apply.</span>
          </p>
          {value !== "" ? (
            <button
              type="button"
              onClick={() => {
                onApply("");
                onClose();
              }}
              className="shrink-0 rounded text-[11px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Clear date
            </button>
          ) : null}
        </div>

        <div className="h-px bg-line" />
        <div className="flex gap-2">
          <Button type="button" variant="text" onClick={onClose} className="flex-1 border-surface bg-surface">
            Cancel
          </Button>
          <Button type="button" disabled={!canApply} onClick={apply} className="flex-1">
            Apply
          </Button>
        </div>
      </div>
    </>
  );
}
