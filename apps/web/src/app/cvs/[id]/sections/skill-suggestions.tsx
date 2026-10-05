import type { SuggestionState } from "@/lib/cv/skills-form";

/**
 * The suggested skills of a category (Figma "Skills & Technical Competencies"): "+ Skill" buttons
 * that add a skill only when tapped. One already in the CV stays visible, dimmed and disabled
 * without the plus, so it is clear why it cannot be added again.
 */
export function SkillSuggestions({
  suggestions,
  onAdd,
}: {
  suggestions: readonly SuggestionState[];
  onAdd: (skill: string) => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] leading-[normal] font-medium text-[#707887]">Suggested</p>
      <ul className="flex flex-wrap gap-2">
        {suggestions.map(({ skill, added }) => (
          <li key={skill}>
            <button
              type="button"
              disabled={added}
              onClick={() => onAdd(skill)}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-surface p-2 text-[13px] font-medium text-accent hover:bg-accent-tint active:bg-accent active:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              {added ? skill : `+ ${skill}`}
              {added ? <span className="sr-only"> (already added)</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-[normal] text-muted">Select a suggestion to add it to this category.</p>
    </div>
  );
}
