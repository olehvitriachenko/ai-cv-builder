import { Check } from "lucide-react";
import type { SuggestionState } from "@/lib/cv/skills-form";

/**
 * The suggested skills of the chosen category (Figma 05.1 and 08.2 "Suggestion interaction
 * states"): pill buttons that add a skill only when tapped. One already in the CV stays visible as
 * disabled with a check, so it is clear why it cannot be added again.
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
      <p className="text-xs leading-[normal] font-medium text-muted">Suggested</p>
      <ul className="flex flex-wrap gap-2">
        {suggestions.map(({ skill, added }) => (
          <li key={skill}>
            <button
              type="button"
              disabled={added}
              onClick={() => onAdd(skill)}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-canvas px-3.5 text-[13px] font-medium text-ink hover:bg-accent-tint active:bg-accent active:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
            >
              {added ? (
                <Check aria-hidden className="size-3.5" strokeWidth={2} />
              ) : (
                <span aria-hidden className="font-semibold text-accent">
                  +
                </span>
              )}
              {skill}
              {added ? <span className="sr-only"> (already added)</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-normal text-muted">
        Suggested skills are preview only — tap + to add to your CV.
      </p>
    </div>
  );
}
