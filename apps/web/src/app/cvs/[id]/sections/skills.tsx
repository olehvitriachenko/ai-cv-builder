"use client";

import { useId, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import type { DraftFormValues, SkillCategoryFormEntry } from "@/lib/cv/draft-form";
import { SKILL_CATALOGUE } from "@/features/cv-editor/lib/skill-catalogue";
import {
  MAX_CATEGORIES,
  addCategory,
  categoryRefusalMessage,
  removeCategory,
  skillCount,
} from "@/lib/cv/skills-form";
import { NewCategoryCard } from "./new-category-card";
import { SectionCard } from "./section-card";
import { SortableSkillCategory } from "./sortable-skill-category";

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
  const { control, setValue, getValues, formState } = useFormContext<DraftFormValues>();
  const categories = useWatch({ control, name: "skillCategories" });
  const [newMessage, setNewMessage] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const newCardRef = useRef<HTMLDivElement>(null);
  // The empty "New category" card can be removed; "+ Add skills" brings it back.
  const [newVisible, setNewVisible] = useState(true);
  const dndId = useId();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const draggingCategory = categories.find((category) => category.id === draggingId);

  const total = skillCount(categories);
  const filled = categories.filter((entry) => entry.skills.some((item) => item.value.trim() !== "")).length;
  const formError = formState.errors.skillCategories?.message ?? formState.errors.skillCategories?.root?.message;

  const update = (next: SkillCategoryFormEntry[]) =>
    setValue("skillCategories", next, { shouldDirty: true, shouldValidate: true });

  function finishDrag({ active, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over || active.id === over.id) return;
    const current = getValues("skillCategories");
    const from = current.findIndex((category) => category.id === active.id);
    const to = current.findIndex((category) => category.id === over.id);
    if (from >= 0 && to >= 0) update(arrayMove(current, from, to));
  }

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
      <p className="text-sm leading-normal text-muted">Choose a category, then add the skills you can support. Drag the handle to reorder categories.</p>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={(args) => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)}
        onDragStart={({ active }) => setDraggingId(String(active.id))}
        onDragEnd={finishDrag}
        onDragCancel={() => setDraggingId(null)}
        accessibility={{
          screenReaderInstructions: { draggable: "Press Space or Enter to pick up a category, use arrow keys to move it, press Space or Enter to drop, or Escape to cancel." },
          announcements: {
            onDragStart: ({ active }) => `Picked up category ${getValues("skillCategories").find((category) => category.id === active.id)?.name ?? ""}.`,
            onDragOver: ({ active, over }) => over ? `Category ${getValues("skillCategories").find((category) => category.id === active.id)?.name ?? ""} will move to position ${getValues("skillCategories").findIndex((category) => category.id === over.id) + 1}.` : "Outside the category list. Drop here to cancel.",
            onDragEnd: ({ active, over }) => over ? `Dropped category ${getValues("skillCategories").find((category) => category.id === active.id)?.name ?? ""}.` : "Reordering cancelled. The category order is unchanged.",
            onDragCancel: () => "Reordering cancelled. The category order is unchanged.",
          },
        }}
      >
        <SortableContext items={categories.map((category) => category.id)} strategy={verticalListSortingStrategy}>
          <div className="flex min-w-0 flex-col gap-4">
            {categories.map((category) => (
              <SortableSkillCategory
                key={category.id}
                category={category}
                dragging={draggingId !== null}
                disabled={categories.length < 2}
                categories={categories}
                options={options}
                onUpdate={update}
                onRemove={() =>
                  category.skills.some((item) => item.value.trim() !== "") ? setRemoving(category.id) : drop(category.id)
                }
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay adjustScale={false} dropAnimation={null}>
          {draggingCategory ? <div className="pointer-events-none rounded-xl border border-accent-line bg-surface p-4 text-sm font-semibold text-ink shadow-lg">{draggingCategory.name}</div> : null}
        </DragOverlay>
      </DndContext>
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
