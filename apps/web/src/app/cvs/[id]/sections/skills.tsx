"use client";

import { useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { DraftFormValues, SkillCategoryFormEntry } from "@/lib/cv/draft-form";
import { SKILL_CATALOGUE } from "@/lib/cv/skill-catalogue";
import {
  MAX_CATEGORIES,
  addCategory,
  categoryRefusalMessage,
  moveCategory,
  removeCategory,
  skillCount,
} from "@/lib/cv/skills-form";
import { NewCategoryCard } from "./new-category-card";
import { SectionCard } from "./section-card";
import { SkillCategoryCard } from "./skill-category-card";

const skillWord = (count: number): string => (count === 1 ? "skill" : "skills");

/** "React, Node.js and NestJS" */
function listWithAnd(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The Skills & Technical Competencies card (Figma "Section card / Skills & Technical
 * Competencies"): a card per category, each with its Category Name combobox, the Skills field with
 * Add, the suggestions and its skills as chips, then a "New category" card to choose the next one.
 * Everything goes through the form's `skillCategories`; categories without skills are shown here
 * but not saved. The rules are in `skills-form.ts`.
 */
export function Skills() {
  const { control, setValue, formState } = useFormContext<DraftFormValues>();
  const categories = useWatch({ control, name: "skillCategories" });
  const [newMessage, setNewMessage] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const newCardRef = useRef<HTMLDivElement>(null);
  // The empty "New category" card can be removed; "+ Add skills" brings it back.
  const [newVisible, setNewVisible] = useState(true);

  const total = skillCount(categories);
  const filled = categories.filter((entry) => entry.skills.some((item) => item.value.trim() !== "")).length;
  const formError = formState.errors.skillCategories?.message ?? formState.errors.skillCategories?.root?.message;

  const update = (next: SkillCategoryFormEntry[]) =>
    setValue("skillCategories", next, { shouldDirty: true, shouldValidate: true });

  const customNames = categories
    .map((entry) => entry.name)
    .filter((name) => !SKILL_CATALOGUE.some((predefined) => predefined.name.toLowerCase() === name.toLowerCase()));
  const options = [...SKILL_CATALOGUE.map((entry) => entry.name), ...customNames];

  function choose(name: string) {
    const result = addCategory(categories, name);
    if (!result.ok) {
      setNewMessage(categoryRefusalMessage(result.refusal));
      return;
    }
    setNewMessage(null);
    if (result.created) {
      update(result.categories);
    }
    // The skills field of the category that was just chosen takes the focus.
    setTimeout(() => document.getElementById(`skills-input-${result.id}`)?.focus(), 0);
  }

  function drop(id: string) {
    update(removeCategory(categories, id));
    setRemoving(null);
  }

  const pending = categories.find((entry) => entry.id === removing) ?? null;
  const pendingSkills = pending?.skills.map((item) => item.value.trim()).filter((value) => value !== "") ?? [];

  return (
    <SectionCard
      id="cv-section-skills"
      title="Skills & Technical Competencies"
      aside={`${total} ${skillWord(total)} · ${filled} ${filled === 1 ? "category" : "categories"}`}
    >
      <p className="text-sm leading-normal text-muted">Choose a category, then add the skills you can support.</p>

      {categories.map((category, index) => (
        <SkillCategoryCard
          key={category.id}
          category={category}
          index={index}
          categories={categories}
          options={options}
          onUpdate={update}
          onMove={(delta) => update(moveCategory(categories, category.id, delta))}
          onRemove={() =>
            category.skills.some((item) => item.value.trim() !== "") ? setRemoving(category.id) : drop(category.id)
          }
        />
      ))}
      {categories.length < MAX_CATEGORIES && newVisible ? (
        <div ref={newCardRef}>
          <NewCategoryCard options={options} message={newMessage} onChoose={choose} onDismiss={() => setNewVisible(false)} />
        </div>
      ) : null}
      {/* "+ Add skills": go to the New category card and open its category list. */}
      <Button
        type="button"
        variant="text"
        stretch={false}
        className="w-full"
        disabled={categories.length >= MAX_CATEGORIES}
        onClick={() => {
          setNewVisible(true);
          // The card may have just been brought back: open its list after it is on screen.
          setTimeout(() => {
            const trigger = newCardRef.current?.querySelector<HTMLButtonElement>("button[aria-haspopup=listbox]");
            trigger?.scrollIntoView({ block: "center" });
            trigger?.click();
          }, 0);
        }}
      >
        + Add skills
      </Button>
      {formError ? (
        <p role="alert" className="text-xs text-danger">
          {formError}
        </p>
      ) : null}

      {pending ? (
        <ConfirmDialog
          title="Remove this category?"
          confirmLabel="Remove category"
          onConfirm={() => drop(pending.id)}
          onClose={() => setRemoving(null)}
        >
          <p>
            {pending.name} contains {pendingSkills.length} {skillWord(pendingSkills.length)}: {listWithAnd(pendingSkills)}.
            Removing this category also removes {pendingSkills.length === 1 ? "this skill" : "these skills"}.
          </p>
        </ConfirmDialog>
      ) : null}
    </SectionCard>
  );
}
