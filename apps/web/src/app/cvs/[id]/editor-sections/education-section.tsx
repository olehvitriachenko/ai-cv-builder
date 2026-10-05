"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { newEducationEntry, type DraftFormValues } from "@/lib/cv/draft-form";
import { SectionCard } from "./section-card";

const MAX_ENTRIES = 10;

export function EducationSection() {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "education" });
  const entries = useWatch({ control, name: "education" });

  return (
    <SectionCard
      title="Education"
      meta={`${fields.length} ${fields.length === 1 ? "entry" : "entries"}`}
      overview={
        fields.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {entries.map((entry) => (
              <li key={entry.id}>
                {[entry.qualification, entry.institution, [entry.startDate, entry.endDate].filter((part) => part.trim() !== "").join("–")]
                  .filter((part) => part.trim() !== "")
                  .join(" · ") || "Untitled entry"}
              </li>
            ))}
          </ul>
        ) : (
          "No education yet"
        )
      }
    >
      {fields.map((field, index) => {
        const errors = formState.errors.education?.[index];
        return (
          <fieldset key={field.id} className="flex flex-col gap-4 rounded-lg border border-line p-3">
            <legend className="px-1 text-[13px] font-semibold text-ink">Education {index + 1}</legend>
            <TextField label="Qualification" error={errors?.qualification?.message} {...register(`education.${index}.qualification`)} />
            <TextField label="Institution" error={errors?.institution?.message} {...register(`education.${index}.institution`)} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="Start date" error={errors?.startDate?.message} {...register(`education.${index}.startDate`)} />
              <TextField label="End date" error={errors?.endDate?.message} {...register(`education.${index}.endDate`)} />
            </div>
            <TextField label="Details" error={errors?.details?.message} {...register(`education.${index}.details`)} />
            <Button
              type="button"
              variant="text"
              size="compact"
              stretch={false}
              className="self-start text-danger hover:bg-danger-tint"
              onClick={() => remove(index)}
            >
              <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
              Remove education {index + 1}
            </Button>
          </fieldset>
        );
      })}
      {formState.errors.education?.message ? <p className="text-xs text-danger">{formState.errors.education.message}</p> : null}
      <Button
        type="button"
        variant="secondary"
        size="compact"
        stretch={false}
        className="self-start"
        disabled={fields.length >= MAX_ENTRIES}
        onClick={() => append(newEducationEntry())}
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={1.75} />
        Add education
      </Button>
    </SectionCard>
  );
}
