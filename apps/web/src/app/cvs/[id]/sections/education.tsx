"use client";

import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import {
  PRESENT,
  expectedGraduation,
  isCurrentlyStudying,
  isPresent,
  newEducationEntry,
  type DraftFormValues,
} from "@/lib/cv/draft-form";
import { educationCount, educationHeading, studyLine } from "@/lib/cv/entry-labels";
import { EmptySection } from "./empty-section";
import { RemoveButton } from "./remove-button";
import { SectionCard } from "./section-card";

const MAX_ENTRIES = 10;
const PLACEHOLDER = "placeholder:text-muted!";

type StudyStatus = "completed" | "studying";

/**
 * One education entry (05.1, 06.2): institution, degree, **Education status**, start year and the
 * end of the study. "Currently studying" disables the end year ("Not applicable") and asks for an
 * optional expected graduation; nothing extra is stored: the draft's end date is `Present` or the
 * expected graduation while studying, and the end year otherwise. The status starts from that stored
 * end date and is then the person's choice (kept locally, so typing "203" into the expected
 * graduation does not flip it). The entry's details text stays in the draft untouched (the design
 * has no field for it).
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
  const [status, setStatus] = useState<StudyStatus>(() => (isCurrentlyStudying(entry.endDate) ? "studying" : "completed"));
  const studying = status === "studying";
  const endField = `education.${index}.endDate` as const;

  function changeStatus(next: StudyStatus) {
    setStatus(next);
    const options = { shouldDirty: true, shouldValidate: true };
    if (next === "studying") {
      // An expected graduation already typed (a future year) is kept; anything else becomes Present.
      setValue(endField, isCurrentlyStudying(entry.endDate) ? entry.endDate : PRESENT, options);
    } else if (isPresent(entry.endDate)) {
      setValue(endField, "", options);
    }
  }

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
      <SelectField label="Education status" value={status} onChange={(event) => changeStatus(event.target.value as StudyStatus)}>
        <option value="completed">Completed</option>
        <option value="studying">Currently studying</option>
      </SelectField>
      <div className={`grid grid-cols-1 gap-4 sm:gap-3 ${studying ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <TextField
          label="Start year"
          placeholder="e.g. 2025"
          autoComplete="off"
          className={PLACEHOLDER}
          error={errors?.startDate?.message}
          {...register(`education.${index}.startDate`)}
        />
        {studying ? (
          <>
            <TextField label="End year" placeholder="Not applicable" disabled value="" readOnly />
            <TextField
              label="Expected graduation (optional)"
              placeholder="e.g. 2029"
              autoComplete="off"
              className={PLACEHOLDER}
              error={errors?.endDate?.message}
              value={expectedGraduation(entry.endDate)}
              onChange={(event) =>
                setValue(endField, event.target.value.trim() === "" ? PRESENT : event.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </>
        ) : (
          <TextField
            label="End year"
            placeholder="e.g. 2024"
            autoComplete="off"
            className={PLACEHOLDER}
            error={errors?.endDate?.message}
            {...register(endField)}
          />
        )}
      </div>
      {studying ? <p className="text-xs leading-normal text-muted">{studyLine(entry.endDate)}</p> : null}
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
