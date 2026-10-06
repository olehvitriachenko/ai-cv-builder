"use client";

/** "Switch / Currently working here" (Figma): a 34 × 20 pill with a 12 px label, a real switch button. */
export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group relative flex items-center gap-2 rounded text-left before:absolute before:-inset-x-1 before:-inset-y-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        aria-hidden
        className={`flex h-5 w-[34px] shrink-0 items-center rounded-full px-0.5 transition-colors ${checked ? "justify-end bg-accent" : "justify-start bg-[#d0d5dd]"}`}
      >
        <span className="size-4 rounded-full bg-surface shadow-sm" />
      </span>
      <span className="text-xs leading-normal text-muted">{label}</span>
    </button>
  );
}
