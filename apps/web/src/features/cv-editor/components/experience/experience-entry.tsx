"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { TextField } from "@/shared/ui/field";
import { PRESENT, isPresent, type DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { experienceHeading } from "@/features/cv-editor/lib/entry-labels";
import { dateBounds } from "@/features/cv-editor/lib/date-picker";
import { experienceDuration, parseCvDate } from "@/features/cv-editor/lib/dates";
import { useEditorMotion } from "@/shared/lib/use-editor-motion";
import { Highlights } from "./highlights";
import { RemoveButton } from "../primitives/remove-button";
import { CheckboxRow } from "../primitives/checkbox-row";
import { DatePicker } from "../primitives/date-picker";

const PLACEHOLDER = "placeholder:text-muted!";

/**
 * One role (05.1/06.3): company and dates as its heading, title, company, a **Start date** and an
 * **End date** picker (the End date reads `Present`, locked, while **Currently working here** is on),
 * the highlights and an immediate **Remove experience**. The employer's location stays in the draft untouched (the design
 * has no field for it).
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
  const setPresent = (checked: boolean) => setDate("endDate", checked ? PRESENT : "");
  const currentToggle = { label: "Currently working here", checked: present, onChange: setPresent };
  const startBounds = dateBounds({ future: false });
  const endBounds = dateBounds({ future: false, after: parseCvDate(entry.startDate) });

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
        <DatePicker
          label="Start date"
          value={entry.startDate}
          onChange={(value) => setDate("startDate", value)}
          bounds={startBounds}
          error={errors?.startDate?.message}
          current={currentToggle}
        />
        <DatePicker
          label="End date"
          value={present ? "" : entry.endDate}
          lockedText={present ? PRESENT : undefined}
          onChange={(value) => setDate("endDate", value)}
          bounds={endBounds}
          error={errors?.endDate?.message}
          current={currentToggle}
        />
      </div>
      <CheckboxRow label={currentToggle.label} checked={present} onChange={setPresent} />
      {duration ? <p className="text-xs leading-normal text-muted">Duration: {duration}</p> : null}
      <Highlights experienceIndex={index} />
    </div>
  );
}
