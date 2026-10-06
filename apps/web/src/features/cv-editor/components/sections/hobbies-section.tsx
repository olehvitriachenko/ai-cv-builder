"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { TextField } from "@/shared/ui/field";
import type { DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { SectionCard } from "../primitives/section-card";
import { AddEntryButton, RemoveButton, RemoveSectionButton } from "./section-actions";

const MAX_HOBBIES = 15;

/** Hobbies: short items, one per row; they print on one line separated by dots. */
export function HobbiesSection({ onRemoveSection }: { onRemoveSection: () => void }) {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "hobbies" });
  const entries = useWatch({ control, name: "hobbies" });
  const errors = formState.errors.hobbies;
  const count = entries.filter((item) => item.value.trim() !== "").length;

  return (
    <SectionCard
      id="cv-section-hobbies"
      title="Hobbies"
      count={fields.length === 0 ? null : `${count} ${count === 1 ? "hobby" : "hobbies"}`}
      actions={<RemoveSectionButton title="Hobbies" onClick={onRemoveSection} />}
    >
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              id={index === 0 ? "optional-hobbies-first" : undefined}
              label={fields.length > 1 ? `Hobby ${index + 1}` : "Hobby"}
              placeholder="e.g. Chess"
              autoComplete="off"
              maxLength={60}
              error={errors?.[index]?.value?.message}
              {...register(`hobbies.${index}.value`)}
            />
          </div>
          <div className="pt-6">
            <RemoveButton label={`Remove hobby ${index + 1}`} onClick={() => remove(index)} />
          </div>
        </div>
      ))}
      {errors?.message ? (
        <p role="alert" className="text-xs text-danger">
          {errors.message}
        </p>
      ) : null}
      <AddEntryButton label="Add Hobbies" disabled={fields.length >= MAX_HOBBIES} onClick={() => append({ value: "" })} />
    </SectionCard>
  );
}
