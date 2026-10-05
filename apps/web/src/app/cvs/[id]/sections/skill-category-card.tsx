"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FieldFrame, describedBy } from "@/components/ui/field";
import type { SkillCategoryFormEntry } from "@/lib/cv/draft-form";
import { suggestionsFor } from "@/lib/cv/skill-catalogue";
import {
  MAX_SKILLS_TOTAL,
  addSkill,
  canMoveCategory,
  categoryRefusalMessage,
  refusalMessage,
  removeSkill,
  renameCategory,
  skillCount,
  suggestionStates,
} from "@/lib/cv/skills-form";
import { SkillChip } from "./skill-chip";
import { SkillSuggestions } from "./skill-suggestions";

export const CATEGORY_COMBOBOX = {
  searchLabel: "Search categories",
  searchPlaceholder: "Search canonical categories…",
  noMatchesLabel: "No matches",
  custom: {
    label: (name: string) => `Use "${name}" as custom category`,
    hint: "Custom category · not canonical. Created only on explicit selection.",
  },
};

const skillWord = (count: number): string => (count === 1 ? "skill" : "skills");

/**
 * One category of the Skills card (Figma "Category card / …"): its name (a combobox: choosing
 * another predefined or custom name renames the category), the Skills field with **+ Add**, the
 * suggestions, and the contained area with the skills as removable chips. The rules (refusals,
 * limits) are in `skills-form.ts`. The category's order and removal are text actions at the foot.
 */
export function SkillCategoryCard({
  category,
  index,
  categories,
  options,
  onUpdate,
  onMove,
  onRemove,
}: {
  category: SkillCategoryFormEntry;
  index: number;
  categories: SkillCategoryFormEntry[];
  options: readonly string[];
  onUpdate: (next: SkillCategoryFormEntry[]) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const inputId = `skills-input-${category.id}`;
  const skills = category.skills.map((item, position) => ({ skill: item.value.trim(), position })).filter((item) => item.skill !== "");
  const atLimit = skillCount(categories) >= MAX_SKILLS_TOTAL;
  const fieldError = atLimit ? refusalMessage({ reason: "limit", max: MAX_SKILLS_TOTAL }, "") : (message ?? undefined);
  const hint = `${skills.length} ${skillWord(skills.length)} added`;

  function add(skill: string, clear: boolean) {
    const result = addSkill(categories, category.id, skill);
    if (!result.ok) {
      setMessage(refusalMessage(result.refusal, skill));
      return;
    }
    onUpdate(result.categories);
    setMessage(null);
    if (clear) {
      setText("");
    }
  }

  function rename(name: string) {
    const result = renameCategory(categories, category.id, name);
    if (!result.ok) {
      setNameMessage(categoryRefusalMessage(result.refusal));
      return;
    }
    setNameMessage(null);
    onUpdate(result.categories);
  }

  return (
    <section aria-label={category.name} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <Combobox
        label="Category Name"
        value={category.name}
        placeholder="Select category"
        options={options}
        {...CATEGORY_COMBOBOX}
        onSelect={rename}
      />
      {nameMessage ? (
        <p role="alert" className="text-xs text-danger">
          {nameMessage}
        </p>
      ) : null}

      <FieldFrame label="Skills" controlId={inputId} hint={hint} error={fieldError}>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="text"
            value={text}
            autoComplete="off"
            placeholder="Type a skill and press Add"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy(inputId, hint, fieldError)}
            onChange={(event) => {
              setText(event.target.value);
              setMessage(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(text, true);
              }
            }}
            className={`h-11 min-w-0 flex-1 rounded-lg bg-surface px-3 text-sm text-ink placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
              fieldError ? "border-[1.5px] border-danger" : "border border-line"
            }`}
          />
          <Button type="button" stretch={false} disabled={atLimit} onClick={() => add(text, true)}>
            + Add
          </Button>
        </div>
      </FieldFrame>

      <SkillSuggestions suggestions={suggestionStates(suggestionsFor(category.name), categories)} onAdd={(skill) => add(skill, false)} />

      {skills.length > 0 ? (
        <div className="flex min-h-20 flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-canvas p-3">
          {skills.map(({ skill, position }) => (
            <SkillChip
              key={`${skill}-${position}`}
              skill={skill}
              onRemove={() => onUpdate(removeSkill(categories, category.id, position))}
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="text" stretch={false} disabled={!canMoveCategory(index, -1, categories.length)} onClick={() => onMove(-1)}>
          ↑ Move up
        </Button>
        <Button type="button" variant="text" stretch={false} disabled={!canMoveCategory(index, 1, categories.length)} onClick={() => onMove(1)}>
          ↓ Move down
        </Button>
        <Button type="button" variant="text" stretch={false} className="text-danger! hover:bg-danger-tint!" onClick={onRemove}>
          Remove category
        </Button>
      </div>
    </section>
  );
}
