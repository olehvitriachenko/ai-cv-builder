"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { SelectField, TextField } from "@/shared/ui/field";
import { PRESENT, isPresent, type DraftFormValues } from "@/lib/cv/draft-form";
import { experienceHeading } from "@/lib/cv/entry-labels";
import { experienceDuration } from "@/lib/cv/dates";
import { useEditorMotion } from "@/shared/lib/use-editor-motion";
import { Highlights } from "./highlights";
import { RemoveButton } from "./remove-button";
import { DateField } from "./date-field";

const PLACEHOLDER = "placeholder:text-muted!";

/**
 * One role (05.1/06.1): company and dates as its heading, title, company, start date, an **End date**
 * select (`Present` or a specific date, which then asks for it), the highlights and an immediate
 * **Remove experience**. The employer's location stays in the draft untouched (the design has no
 * field for it).
 */
export function ExperienceEntry({
  index,
  showHeading,
  onRemove,
}: {
  index: number;
  showHeading: boolean;
  onRemove: () => void;
}) {
  const { control, register, setValue, formState } = useFormContext<DraftFormValues>();
  const entry = useWatch({ control, name: `experience.${index}` });
  const errors = formState.errors.experience?.[index];
  const present = isPresent(entry.endDate);
  const duration = experienceDuration(entry.startDate, entry.endDate);
  const motionRef = useEditorMotion();
  const setDate = (field: "startDate" | "endDate", value: string) => setValue(`experience.${index}.${field}`, value, { shouldDirty: true, shouldValidate: true });

  return (
    <div ref={motionRef} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[13px] leading-[normal] font-semibold text-ink [overflow-wrap:anywhere]">
          {showHeading || entry.employer.trim() !== "" ? experienceHeading(entry) : ""}
        </p>
        <RemoveButton label={`Remove ${experienceHeading(entry)}`} onClick={onRemove} />
      </div>
      <TextField
        label="Title"
        placeholder="Enter job title"
        autoComplete="off"
        className={PLACEHOLDER}
        error={errors?.title?.message}
        {...register(`experience.${index}.title`)}
      />
      <TextField
        label="Company"
        placeholder="Enter company"
        autoComplete="off"
        className={PLACEHOLDER}
        error={errors?.employer?.message}
        {...register(`experience.${index}.employer`)}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
        <DateField
          label="Start date"
          name={`experience.${index}.startDate`}
          value={entry.startDate}
          onChange={(value) => setDate("startDate", value)}
          maxYear={new Date().getFullYear()}
          error={errors?.startDate?.message}
        />
        <SelectField
          label="End date"
          value={present ? "present" : "date"}
          onChange={(event) =>
            setValue(`experience.${index}.endDate`, event.target.value === "present" ? PRESENT : "", {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          <option value="present">Present</option>
          <option value="date">End date</option>
        </SelectField>
      </div>
      {present ? null : (
        <DateField
          label="Date ended"
          name={`experience.${index}.endDate`}
          value={entry.endDate}
          onChange={(value) => setDate("endDate", value)}
          maxYear={new Date().getFullYear()}
          error={errors?.endDate?.message}
        />
      )}
      {duration ? <p className="text-xs leading-normal text-muted">Duration: {duration}</p> : null}
      <Highlights experienceIndex={index} />
    </div>
  );
}
