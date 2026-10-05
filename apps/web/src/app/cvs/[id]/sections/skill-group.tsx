import { Button } from "@/components/ui/button";
import type { SkillCategoryFormEntry } from "@/lib/cv/draft-form";
import { SkillChip } from "./skill-chip";

const skillWord = (count: number): string => (count === 1 ? "skill" : "skills");

/**
 * One category of the "Added to CV" summary (Figma 05.1 / 08.2 "Category cards and ordering"): its
 * name and count, its skills as removable chips, or the dashed "No items added" state. The
 * category being edited also shows its order and removal controls (44 px; the first cannot move up
 * and the last cannot move down; no drag and drop).
 */
export function SkillGroup({
  category,
  active,
  canMoveUp,
  canMoveDown,
  onActivate,
  onRemoveSkill,
  onMove,
  onRemoveCategory,
}: {
  category: SkillCategoryFormEntry;
  active: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onActivate: () => void;
  onRemoveSkill: (index: number) => void;
  onMove: (delta: -1 | 1) => void;
  onRemoveCategory: () => void;
}) {
  const skills = category.skills.map((item, index) => ({ skill: item.value.trim(), index })).filter((item) => item.skill !== "");
  const empty = skills.length === 0;

  return (
    <section
      aria-label={category.name}
      className={`flex flex-col gap-2 rounded-lg ${active ? "-mx-2 border border-accent-line bg-accent-tint/40 p-2" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label={`Edit ${category.name}`}
          aria-current={active ? "true" : undefined}
          onClick={onActivate}
          className={`min-w-0 rounded text-left text-[11px] leading-[normal] font-semibold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            empty ? "text-muted" : "text-accent"
          }`}
        >
          {category.name}
        </button>
        <p className="shrink-0 text-[11px] leading-[normal] text-muted">
          {skills.length} {skillWord(skills.length)}
        </p>
      </div>
      {empty ? (
        <p className="flex min-h-[52px] items-center justify-center rounded-lg border border-dashed border-line bg-canvas text-xs text-muted">
          No items added
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {skills.map(({ skill, index }) => (
            <li key={`${skill}-${index}`} className="max-w-full">
              <SkillChip skill={skill} onRemove={() => onRemoveSkill(index)} />
            </li>
          ))}
        </ul>
      )}
      {active ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            stretch={false}
            className="text-accent! disabled:text-muted!"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          >
            <span aria-hidden>↑</span> Move up
          </Button>
          <Button
            type="button"
            variant="secondary"
            stretch={false}
            className="text-accent! disabled:text-muted!"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            <span aria-hidden>↓</span> Move down
          </Button>
          <Button type="button" variant="destructive" stretch={false} onClick={onRemoveCategory}>
            Remove category
          </Button>
        </div>
      ) : null}
    </section>
  );
}
