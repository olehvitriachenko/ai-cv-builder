"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { newSkillCategory, type DraftFormValues } from "@/lib/cv/draft-form";
import { ListTextField } from "./list-text-field";
import { SectionCard } from "./section-card";

const MAX_CATEGORIES = 12;

/**
 * Skills grouped by category: a name and a comma-separated list per category. This is the plain
 * editor; the category picker with suggestions replaces it in the skills-by-category story.
 */
export function SkillsSection() {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "skillCategories" });
  const categories = useWatch({ control, name: "skillCategories" });
  const categoriesError = formState.errors.skillCategories;
  const total = categories.reduce(
    (count, category) => count + category.skills.filter((item) => item.value.trim() !== "").length,
    0,
  );
  const overview = categories
    .filter((category) => category.skills.some((item) => item.value.trim() !== ""))
    .map((category) => `${category.name.trim() || "Unnamed"}: ${category.skills.map((item) => item.value.trim()).filter(Boolean).join(", ")}`)
    .join(" · ");

  return (
    <SectionCard
      title="Skills"
      meta={`${total} ${total === 1 ? "skill" : "skills"}`}
      overview={overview || "No skills yet"}
    >
      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-line p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label={`Category ${index + 1} name`}
                error={categoriesError?.[index]?.name?.message}
                {...register(`skillCategories.${index}.name`)}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove category ${index + 1}`}
              onClick={() => remove(index)}
              className="mt-7 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </div>
          <ListTextField
            name={`skillCategories.${index}.skills`}
            label={`Category ${index + 1} skills`}
            separator="comma"
            hint="Separate skills with commas."
            rows={3}
          />
        </div>
      ))}
      {categoriesError?.message ?? categoriesError?.root?.message ? (
        <p role="alert" className="text-xs text-danger">
          {categoriesError?.message ?? categoriesError?.root?.message}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="compact"
        stretch={false}
        className="self-start"
        disabled={fields.length >= MAX_CATEGORIES}
        onClick={() => append(newSkillCategory())}
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={1.75} />
        Add category
      </Button>
    </SectionCard>
  );
}
