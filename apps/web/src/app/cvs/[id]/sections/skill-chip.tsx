/**
 * "Forma / Skill chip" (Figma 08.2 "Chip states"): the skill and a 44 px remove target, separated by
 * the white rule of the design. The remove button names the skill for assistive technology.
 */
export function SkillChip({ skill, onRemove }: { skill: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-11 max-w-full items-center gap-1 rounded-lg border border-line bg-canvas pl-3">
      <span className="min-w-0 text-[13px] leading-[normal] font-medium text-ink [overflow-wrap:anywhere]">
        {skill}
      </span>
      <button
        type="button"
        aria-label={`Remove ${skill}`}
        onClick={onRemove}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white text-sm leading-none font-semibold text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <span aria-hidden>×</span>
      </button>
    </span>
  );
}
