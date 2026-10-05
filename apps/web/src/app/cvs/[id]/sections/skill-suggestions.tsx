import type { SuggestionState } from "@/lib/cv/skills-form";
import { useEditorMotion } from "@/lib/cv/use-editor-motion";

/**
 * The suggested skills of a category (Figma "Skills & Technical Competencies"): "+ Skill" buttons
 * that add a skill only when tapped. One already in the CV disappears, and when none is left the
 * whole block (title, buttons and hint) takes no space.
 */
export function SkillSuggestions({
  suggestions,
  onAdd,
}: {
  suggestions: readonly SuggestionState[];
  onAdd: (skill: string) => void;
}) {
  const motionRef = useEditorMotion<HTMLUListElement>();
  const open = suggestions.filter((suggestion) => !suggestion.added);
  if (open.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] leading-[normal] font-medium text-[#707887]">Suggested</p>
      <ul ref={motionRef} className="flex flex-wrap gap-2">
        {open.map(({ skill }) => (
          <li key={skill}>
            <button
              type="button"
              onClick={() => onAdd(skill)}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-surface p-2 text-[13px] font-medium text-accent hover:bg-accent-tint active:bg-accent active:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              + {skill}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-[normal] text-muted">Select a suggestion to add it to this category.</p>
    </div>
  );
}
