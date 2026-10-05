"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { PRESENT, isPresent, type DraftFormValues } from "@/lib/cv/draft-form";
import { experienceHeading } from "@/lib/cv/entry-labels";
import { Highlights } from "./highlights";

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

  return (
    <div className="flex flex-col gap-4">
      {showHeading || entry.employer.trim() !== "" ? (
        <p className="text-[13px] leading-[normal] font-semibold text-ink [overflow-wrap:anywhere]">
          {experienceHeading(entry)}
        </p>
      ) : null}
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
        <TextField
          label="Start date"
          placeholder="e.g. Jun 2025"
          autoComplete="off"
          className={PLACEHOLDER}
          error={errors?.startDate?.message}
          {...register(`experience.${index}.startDate`)}
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
        <TextField
          label="Date ended"
          placeholder="e.g. Aug 2024"
          autoComplete="off"
          className={PLACEHOLDER}
          error={errors?.endDate?.message}
          {...register(`experience.${index}.endDate`)}
        />
      )}
      <Highlights experienceIndex={index} />
      <Button
        type="button"
        variant="text"
        stretch={false}
        className="self-start text-danger! hover:bg-danger-tint!"
        onClick={onRemove}
      >
        Remove experience
      </Button>
    </div>
  );
}
