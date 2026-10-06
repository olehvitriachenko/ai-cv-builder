"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useEditorMotion } from "@/shared/lib/use-editor-motion";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { SelectField, TextField } from "@/shared/ui/field";
import { LANGUAGE_LEVELS } from "@/entities/cv/schemas";
import { newLanguageEntry, type DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { SectionCard } from "../primitives/section-card";
import { AddEntryButton, RemoveButton, RemoveSectionButton } from "./section-actions";

const MAX_LANGUAGES = 12;

/** One language card; the grip at its left edge drags it (or Space, arrows, Space with the keyboard). */
function SortableLanguage({
  id,
  disabled,
  label,
  actions,
  children,
}: {
  id: string;
  disabled: boolean;
  label: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    transition: { duration: 180, easing: "ease-out" },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 rounded-xl border bg-surface p-4 max-sm:gap-y-1 ${isDragging ? "relative z-20 border-accent shadow-lg" : "border-line"}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Reorder ${label}`}
        title="Drag to reorder. Keyboard: Space, arrows, Space; Esc to cancel."
        className="-ml-1 flex size-11 sm:mt-6 shrink-0 touch-none items-center justify-center rounded-lg text-placeholder hover:bg-accent-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-default disabled:opacity-30 max-sm:-ml-2"
      >
        <GripVertical aria-hidden className="size-[18px]" strokeWidth={1.75} />
      </button>
      {/* A phone puts the grip and the trash button in a row above the fields; from sm up the fields sit between them. */}
      <div className="min-w-0 max-sm:col-span-3 max-sm:row-start-2 sm:col-start-2 sm:row-start-1">{children}</div>
      <div className="col-start-3 row-start-1 sm:pt-6">{actions}</div>
    </div>
  );
}

/** Languages: a name and an optional level per entry; a blank entry is never saved. */
export function LanguagesSection({ onRemoveSection }: { onRemoveSection: () => void }) {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: "languages" });
  const dndId = useId();
  const [dragging, setDragging] = useState(false);
  const listRef = useEditorMotion(!dragging);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function finishDrag({ active, over }: DragEndEvent) {
    setDragging(false);
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((field) => field.id === active.id);
    const to = fields.findIndex((field) => field.id === over.id);
    if (from >= 0 && to >= 0) move(from, to);
  }
  const entries = useWatch({ control, name: "languages" });
  const errors = formState.errors.languages;
  const count = entries.filter((entry) => entry.name.trim() !== "").length;

  return (
    <SectionCard
      id="cv-section-languages"
      title="Languages"
      count={fields.length === 0 ? null : `${count} ${count === 1 ? "language" : "languages"}`}
      actions={<RemoveSectionButton title="Languages" onClick={onRemoveSection} />}
    >
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)} onDragEnd={finishDrag}>
        <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
          <div ref={listRef} className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <SortableLanguage
                key={field.id}
                id={field.id}
                disabled={fields.length < 2}
                label={`language ${index + 1}`}
                actions={<RemoveButton label={`Remove language ${index + 1}`} onClick={() => remove(index)} />}
              >
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  id={index === 0 ? "optional-languages-first" : undefined}
                  label={fields.length > 1 ? `Language ${index + 1}` : "Language"}
                  placeholder="e.g. English"
                  autoComplete="off"
                  maxLength={60}
                  error={errors?.[index]?.name?.message}
                  {...register(`languages.${index}.name`)}
                />
                <SelectField label={fields.length > 1 ? `Level ${index + 1}` : "Level"} {...register(`languages.${index}.level`)}>
                  <option value="">Select level</option>
                  {LANGUAGE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </SelectField>
              </div>
              </SortableLanguage>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {errors?.message ? (
        <p role="alert" className="text-xs text-danger">
          {errors.message}
        </p>
      ) : null}
      <AddEntryButton label="Add Languages" disabled={fields.length >= MAX_LANGUAGES} onClick={() => append(newLanguageEntry())} />
    </SectionCard>
  );
}
