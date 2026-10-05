"use client";

import { useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldFrame, describedBy } from "@/components/ui/field";
import type { DraftFormValues, SkillCategoryFormEntry } from "@/lib/cv/draft-form";
import { SKILL_CATALOGUE, suggestionsFor } from "@/lib/cv/skill-catalogue";
import {
  MAX_SKILLS_TOTAL,
  addCategory,
  addSkill,
  canMoveCategory,
  categoryRefusalMessage,
  moveCategory,
  needsMoreSkills,
  refusalMessage,
  removeCategory,
  removeSkill,
  skillCount,
  suggestionStates,
} from "@/lib/cv/skills-form";
import { SectionCard } from "./section-card";
import { SkillGroup } from "./skill-group";
import { SkillSuggestions } from "./skill-suggestions";

const skillWord = (count: number): string => (count === 1 ? "skill" : "skills");

/** "React, Node.js and NestJS" */
function listWithAnd(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The Skills & Technical Competencies card (Figma 05.1, 08.1, 08.2): choose a category (a
 * predefined one or a custom name), add skills to it by typing or by tapping a suggestion, and see
 * everything added so far grouped by category, with removable chips. The category being edited
 * can be moved or removed. Everything goes through the form's `skillCategories`; empty categories
 * are shown here but not saved. The rules are in `skills-form.ts`.
 */
export function Skills() {
  const { control, setValue, formState } = useFormContext<DraftFormValues>();
  const categories = useWatch({ control, name: "skillCategories" });
  const [activeId, setActiveId] = useState<string | null>(() => categories[0]?.id ?? null);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [categoryMessage, setCategoryMessage] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const comboRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = "skills-input";

  const total = skillCount(categories);
  const active = categories.find((entry) => entry.id === activeId) ?? null;
  const atLimit = total >= MAX_SKILLS_TOTAL;
  const formError = formState.errors.skillCategories?.message ?? formState.errors.skillCategories?.root?.message;

  const update = (next: SkillCategoryFormEntry[]) =>
    setValue("skillCategories", next, { shouldDirty: true, shouldValidate: true });

  const customNames = categories
    .map((entry) => entry.name)
    .filter((name) => !SKILL_CATALOGUE.some((predefined) => predefined.name.toLowerCase() === name.toLowerCase()));
  const options = [...SKILL_CATALOGUE.map((entry) => entry.name), ...customNames];

  function add(skill: string, clearInput: boolean) {
    const result = addSkill(categories, active?.id ?? "", skill);
    if (!result.ok) {
      setMessage(refusalMessage(result.refusal, skill));
      return;
    }
    update(result.categories);
    setMessage(null);
    if (clearInput) {
      setText("");
    }
  }

  function choose(name: string) {
    const result = addCategory(categories, name);
    if (!result.ok) {
      setCategoryMessage(categoryRefusalMessage(result.refusal));
      return;
    }
    setCategoryMessage(null);
    setMessage(null);
    if (result.created) {
      update(result.categories);
    }
    setActiveId(result.id);
    // The skills field appears with the chosen category; move to it.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function activate(id: string) {
    setActiveId(id);
    setMessage(null);
    setCategoryMessage(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function dropCategory(id: string) {
    update(removeCategory(categories, id));
    setActiveId((current) => (current === id ? null : current));
    setRemoving(null);
  }

  const pending = categories.find((entry) => entry.id === removing) ?? null;
  const pendingSkills = pending?.skills.map((item) => item.value.trim()).filter((value) => value !== "") ?? [];
  const fieldError = atLimit ? refusalMessage({ reason: "limit", max: MAX_SKILLS_TOTAL }, "") : (message ?? undefined);
  const hint = needsMoreSkills(total) ? "It is suggested to add at least 5 skills" : undefined;

  return (
    <SectionCard id="cv-section-skills" title="Skills & Technical Competencies" aside={`${total} ${skillWord(total)} · By category`}>
      <p className="text-xs leading-normal text-muted">Choose a category, then add the skills you can support.</p>

      <Combobox
        label="Category Name"
        value={active?.name ?? null}
        placeholder="Choose a category"
        options={options}
        searchLabel="Search categories"
        searchPlaceholder="Search canonical categories…"
        noMatchesLabel="No matches"
        custom={{
          label: (name) => `Use "${name}" as custom category`,
          hint: "Custom category · not canonical. Created only on explicit selection.",
        }}
        onSelect={choose}
        triggerRef={comboRef}
      />
      {categoryMessage ? (
        <p role="alert" className="text-xs text-danger">
          {categoryMessage}
        </p>
      ) : null}

      {active ? (
        <>
          <FieldFrame label="Skills" controlId={inputId} hint={hint} error={fieldError}>
            <div className="flex gap-2">
              <input
                ref={inputRef}
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
          <SkillSuggestions
            suggestions={suggestionStates(suggestionsFor(active.name), categories)}
            onAdd={(skill) => add(skill, false)}
          />
        </>
      ) : null}

      {categories.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs leading-[normal] font-medium text-muted">Added to CV</p>
            <p className="text-[11px] leading-[normal] font-semibold text-accent">
              {total} {skillWord(total)}
            </p>
          </div>
          {categories.map((category, index) => (
            <SkillGroup
              key={category.id}
              category={category}
              active={category.id === activeId}
              canMoveUp={canMoveCategory(index, -1, categories.length)}
              canMoveDown={canMoveCategory(index, 1, categories.length)}
              onActivate={() => activate(category.id)}
              onRemoveSkill={(skillIndex) => update(removeSkill(categories, category.id, skillIndex))}
              onMove={(delta) => update(moveCategory(categories, category.id, delta))}
              onRemoveCategory={() =>
                category.skills.some((item) => item.value.trim() !== "") ? setRemoving(category.id) : dropCategory(category.id)
              }
            />
          ))}
        </div>
      ) : null}

      {formError ? (
        <p role="alert" className="text-xs text-danger">
          {formError}
        </p>
      ) : null}

      <Button
        type="button"
        variant="text"
        stretch={false}
        className="w-full"
        onClick={() => {
          setActiveId(null);
          setText("");
          setMessage(null);
          comboRef.current?.focus();
        }}
      >
        + Add skills
      </Button>

      {pending ? (
        <ConfirmDialog
          title="Remove this category?"
          confirmLabel="Remove category"
          onConfirm={() => dropCategory(pending.id)}
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
