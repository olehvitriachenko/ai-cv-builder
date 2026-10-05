"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { customCategoryOption, filterCategories, nextActiveIndex, type NavigationKey } from "@/lib/cv/category-filter";

// "Forma / Select" that opens a contained search list (Figma 08.2 "Category combobox"): a trigger
// that looks like the select, and below it, in the page flow so it never overflows a phone, a
// search field with a listbox. The search field is the ARIA 1.2 combobox; the trigger is a button
// that opens it. Choosing is always explicit (click, Enter): nothing changes while browsing.

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

interface CustomOption {
  /** The text of the option for the typed text, e.g. `Use "Observability" as custom category`. */
  label: (text: string) => string;
  hint: string;
}

export function Combobox({
  label,
  value,
  placeholder,
  options,
  searchLabel,
  searchPlaceholder,
  noMatchesLabel,
  custom,
  onSelect,
  triggerRef,
  trailing,
}: {
  label: string;
  /** The chosen option, or `null` while nothing is chosen. */
  value: string | null;
  placeholder: string;
  options: readonly string[];
  searchLabel: string;
  searchPlaceholder: string;
  noMatchesLabel: string;
  custom?: CustomOption;
  onSelect: (value: string) => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  /** A control beside the trigger (for example a delete button), aligned with it. */
  trailing?: React.ReactNode;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const labelId = `${id}-label`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const ownTrigger = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? ownTrigger;
  const searchRef = useRef<HTMLInputElement>(null);

  const matches = filterCategories(query, options);
  const customText = custom ? customCategoryOption(query, options) : null;
  const items = customText === null ? matches : [...matches, customText];
  const customIndex = customText === null ? -1 : items.length - 1;

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  function close(returnFocus: boolean) {
    setOpen(false);
    setQuery("");
    setActive(-1);
    if (returnFocus) {
      trigger.current?.focus();
    }
  }

  function choose(index: number) {
    const chosen = items[index];
    if (chosen !== undefined) {
      onSelect(chosen);
      close(true);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const key: NavigationKey = event.key;
      setActive((current) => nextActiveIndex(current, key, items.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  }

  const activeId = active >= 0 ? `${id}-option-${active}` : undefined;

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <span id={labelId} className="text-[13px] leading-[normal] font-medium text-ink">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          ref={trigger}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${labelId} ${id}-value`}
          onClick={() => (open ? close(false) : setOpen(true))}
          className={`relative flex h-11 min-w-0 flex-1 items-center rounded-lg bg-surface pr-10 pl-3 text-left text-sm ${FOCUS_RING} ${
            open ? "border-[1.5px] border-accent" : "border border-line"
          }`}
        >
          <span id={`${id}-value`} className={`min-w-0 truncate ${value === null ? "text-muted" : "text-ink"}`}>
            {value ?? placeholder}
          </span>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
            strokeWidth={1.75}
          />
        </button>
        {trailing}
      </div>
      {open ? (
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-2">
          <label htmlFor={`${id}-search`} className="text-[13px] leading-[normal] font-medium text-ink">
            {searchLabel}
          </label>
          <input
            ref={searchRef}
            id={`${id}-search`}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            className={`mt-2 mb-1 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-placeholder ${FOCUS_RING}`}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={searchLabel}
            className="flex max-h-72 flex-col gap-1 overflow-y-auto overscroll-contain"
          >
            {items.map((item, index) => {
              const isCustom = index === customIndex;
              const selected = !isCustom && value !== null && item.toLowerCase() === value.toLowerCase();
              return (
                <li
                  key={`${item}-${isCustom ? "custom" : "option"}`}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                  onMouseMove={() => setActive(index)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm leading-[1.6] ${
                    isCustom ? "font-semibold text-accent" : "text-ink"
                  } ${index === active || selected ? "bg-accent-tint" : "bg-surface"}`}
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {isCustom && custom ? custom.label(item) : item}
                  </span>
                  {selected ? <Check aria-hidden className="size-4 shrink-0 text-accent" strokeWidth={2} /> : null}
                </li>
              );
            })}
          </ul>
          {matches.length === 0 ? (
            <p role="status" className="text-xs leading-normal text-muted">
              {noMatchesLabel}
            </p>
          ) : null}
          {customText !== null && custom ? (
            <p className="text-xs leading-normal text-accent">{custom.hint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
