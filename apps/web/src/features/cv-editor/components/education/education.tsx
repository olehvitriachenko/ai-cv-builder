"use client";

import { GraduationCap } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/field";
import {
  newEducationEntry,
  type DraftFormValues,
} from "@/features/cv-editor/model/draft-form";
import { educationCount, educationHeading } from "@/features/cv-editor/lib/entry-labels";
import { maxEducationYear } from "@/features/cv-editor/lib/dates";
import { useEditorMotion } from "@/shared/lib/use-editor-motion";
import { DateField } from "../primitives/date-field";
import { EmptySection } from "../primitives/empty-section";
import { RemoveButton } from "../primitives/remove-button";
import { SectionCard } from "../primitives/section-card";

const MAX_ENTRIES = 10;
const PLACEHOLDER = "placeholder:text-muted!";

/**
 * Two directly editable years. A future end year is expected graduation; Present preserves
 * ongoing education without requiring a separate status control or an invented end year.
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
  const { control, register, formState, setValue } = useFormContext<DraftFormValues>();
  const entry = useWatch({ control, name: `education.${index}` });
  const errors = formState.errors.education?.[index];
  const dateMotionRef = useEditorMotion();
  const endField = `education.${index}.endDate` as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[13px] leading-[normal] font-semibold text-ink [overflow-wrap:anywhere]">
          {showHeading ? educationHeading(entry) : ""}
        </p>
        <RemoveButton label={`Remove ${educationHeading(entry)}`} onClick={onRemove} />
      </div>
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
      <div ref={dateMotionRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
        <DateField
          label="Start year"
          name={`education.${index}.startDate`}
          yearOnly
          value={entry.startDate}
          onChange={(value) => setValue(`education.${index}.startDate`, value, { shouldDirty: true, shouldValidate: true })}
          maxYear={new Date().getFullYear()}
          error={errors?.startDate?.message}
        />
        <TextField
          label="End year"
          placeholder="e.g. 2028 or Present"
          autoComplete="off"
          className={PLACEHOLDER}
          hint={`Future years (up to ${maxEducationYear()}) mean expected graduation. Use Present if still studying.`}
          error={errors?.endDate?.message}
          {...register(endField)}
        />
      </div>
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
      + Add education
    </Button>
  );

  return (
    <SectionCard id="cv-section-education" title="Education" count={educationCount(entries)}>
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
