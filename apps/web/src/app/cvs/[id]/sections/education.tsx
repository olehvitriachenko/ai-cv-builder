"use client";

import { GraduationCap, Plus } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { isCurrentlyStudying, newEducationEntry, type DraftFormValues } from "@/lib/cv/draft-form";
import { educationCount, educationHeading, studyLine } from "@/lib/cv/entry-labels";
import { EmptySection } from "./empty-section";
import { SectionCard } from "./section-card";

const MAX_ENTRIES = 10;
const PLACEHOLDER = "placeholder:text-muted!";

/**
 * One education entry (05.1): institution, degree, start year and end year. The end year is
 * labelled "(expected)" and a "Currently studying" line appears while the study is ongoing, which
 * is derived from the stored end date (`Present` or a future year); nothing extra is stored. The
 * entry's details text stays in the draft untouched (the design has no field for it).
 */
function EducationEntry({
  index,
  showHeading,
  onRemove,
}: {
  index: number;
  showHeading: boolean;
  onRemove: () => void;
}) {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const entry = useWatch({ control, name: `education.${index}` });
  const errors = formState.errors.education?.[index];
  const studying = isCurrentlyStudying(entry.endDate);

  return (
    <div className="flex flex-col gap-4">
      {showHeading ? (
        <p className="text-[13px] leading-[normal] font-semibold text-ink [overflow-wrap:anywhere]">
          {educationHeading(entry)}
        </p>
      ) : null}
      <TextField
        label="Institution"
        placeholder="Enter institution"
        autoComplete="off"
        className={PLACEHOLDER}
        error={errors?.institution?.message}
        {...register(`education.${index}.institution`)}
      />
      <TextField
        label="Degree / Program"
        placeholder="Enter degree or program"
        autoComplete="off"
        className={PLACEHOLDER}
        error={errors?.qualification?.message}
        {...register(`education.${index}.qualification`)}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
        <TextField
          label="Start year"
          placeholder="e.g. 2025"
          autoComplete="off"
          className={PLACEHOLDER}
          error={errors?.startDate?.message}
          {...register(`education.${index}.startDate`)}
        />
        <TextField
          label={studying ? "End year (expected)" : "End year"}
          placeholder="e.g. 2029"
          autoComplete="off"
          className={PLACEHOLDER}
          error={errors?.endDate?.message}
          {...register(`education.${index}.endDate`)}
        />
      </div>
      {studying ? <p className="text-xs leading-normal text-muted">{studyLine(entry.endDate)}</p> : null}
      <Button
        type="button"
        variant="text"
        stretch={false}
        className="self-start text-danger! hover:bg-danger-tint!"
        onClick={onRemove}
      >
        Remove
      </Button>
    </div>
  );
}

/** Education (05.1/06.2): every entry open, add and remove at once, empty state. */
export function Education() {
  const { control, formState, trigger } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "education" });
  const entries = useWatch({ control, name: "education" });
  const sectionError = formState.errors.education?.message;

  // A new entry cannot be saved until it has an institution or a degree, so say so on the field at once.
  function addEntry() {
    const index = fields.length;
    append(newEducationEntry());
    setTimeout(() => void trigger(`education.${index}.institution`), 0);
  }

  const add = (
    <Button
      type="button"
      variant={fields.length === 0 ? "primary" : "text"}
      stretch={false}
      className={fields.length === 0 ? "" : "w-full"}
      disabled={fields.length >= MAX_ENTRIES}
      onClick={addEntry}
    >
      <Plus aria-hidden className="size-3.5" strokeWidth={2} />
      Add education
    </Button>
  );

  return (
    <SectionCard title="Education" count={educationCount(entries)}>
      {fields.length === 0 ? (
        <EmptySection
          icon={GraduationCap}
          title="No education added"
          text="Add only details you can confirm. Nothing is added automatically."
          action={add}
        />
      ) : (
        <>
          {fields.map((field, index) => (
            <div key={field.id} className={index === 0 ? "" : "border-t border-line pt-4"}>
              <EducationEntry index={index} showHeading={fields.length > 1} onRemove={() => remove(index)} />
            </div>
          ))}
          {sectionError ? (
            <p role="alert" className="text-xs text-danger">
              {sectionError}
            </p>
          ) : null}
          {add}
        </>
      )}
    </SectionCard>
  );
}
