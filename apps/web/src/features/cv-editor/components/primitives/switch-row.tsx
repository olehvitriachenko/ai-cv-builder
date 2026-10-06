"use client";

/**
 * "Switch / Currently working here". Desktop (Figma 41:22343): a 34 × 20 pill and a 12 px label.
 * Phone (06.7): a 44 × 26 pill in a 44 px row, a 13 px label and a hint line under it.
 */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  /** The line under the label, shown on a phone only. */
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex min-h-11 items-center gap-2.5 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-0 sm:gap-2 sm:before:absolute sm:before:-inset-x-1 sm:before:-inset-y-3"
    >
      <span
        aria-hidden
        className={`flex h-[26px] w-11 shrink-0 items-center rounded-full px-[3px] transition-colors sm:h-5 sm:w-[34px] sm:px-0.5 ${checked ? "justify-end bg-accent" : "justify-start bg-[#d0d5dd]"}`}
      >
        <span className="size-5 rounded-full bg-surface shadow-sm sm:size-4" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] leading-[normal] font-medium text-ink sm:text-xs sm:leading-normal sm:font-normal sm:text-muted">
          {label}
        </span>
        {hint ? <span className="text-[11px] leading-normal text-muted sm:hidden">{hint}</span> : null}
      </span>
    </button>
  );
}
