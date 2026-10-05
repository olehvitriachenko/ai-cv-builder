"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { newSkillCategory, type DraftFormValues } from "@/lib/cv/draft-form";
import { SectionCard } from "./section-card";
import { SkillsListField } from "./skills-list-field";

const MAX_CATEGORIES = 12;

/**
 * The Skills & Technical Competencies card (05.1) as a shell over the v2 `skillCategories`: the
 * heading and count line of the design around the plain per-category editor. TEMPORARY: the
 * category picker with suggestions and chips replaces the body in the skills-by-category story.
 */
export function SkillsShell() {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "skillCategories" });
  const categories = useWatch({ control, name: "skillCategories" });
  const categoriesError = formState.errors.skillCategories;
  const total = categories.reduce(
    (count, category) => count + category.skills.filter((item) => item.value.trim() !== "").length,
    0,
  );
  const arrayError = categoriesError?.message ?? categoriesError?.root?.message;

  return (
    <SectionCard
      title="Skills & Technical Competencies"
      count={`${total} ${total === 1 ? "skill" : "skills"} · By category`}
    >
      <p className="text-xs leading-normal text-muted">Choose a category, then add the skills you can support.</p>
      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label={`Category ${index + 1} name`}
                placeholder="Category name"
                className="placeholder:text-muted!"
                error={categoriesError?.[index]?.name?.message}
                {...register(`skillCategories.${index}.name`)}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove category ${index + 1}`}
              onClick={() => remove(index)}
              className="mt-7 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </div>
          <SkillsListField
            name={`skillCategories.${index}.skills`}
            label={`Category ${index + 1} skills`}
            hint="Separate skills with commas."
          />
        </div>
      ))}
      {arrayError ? (
        <p role="alert" className="text-xs text-danger">
          {arrayError}
        </p>
      ) : null}
      <Button
        type="button"
        variant="text"
        stretch={false}
        className="self-start"
        disabled={fields.length >= MAX_CATEGORIES}
        onClick={() => append(newSkillCategory())}
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={2} />
        Add skills
      </Button>
    </SectionCard>
  );
}
