"use client";

import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { TextareaField, TextField } from "@/shared/ui/field";
import {
  PRESENT,
  expectedGraduation,
  isCurrentlyStudying,
  newEducationEntry,
  type DraftFormValues,
} from "@/features/cv-editor/model/draft-form";
import { educationCount, educationHeading } from "@/features/cv-editor/lib/entry-labels";
import { dateBounds } from "@/features/cv-editor/lib/date-picker";
import { parseCvDate } from "@/features/cv-editor/lib/dates";
import { useEditorMotion } from "@/shared/lib/use-editor-motion";
import { DatePicker } from "../primitives/date-picker";
import { SwitchRow } from "../primitives/switch-row";
import { EmptySection } from "../primitives/empty-section";
import { RemoveButton } from "../primitives/remove-button";
import { SectionCard } from "../primitives/section-card";

const MAX_ENTRIES = 10;
const PLACEHOLDER = "placeholder:text-muted!";

/**
 * Year pickers (Figma 06.3). the **Currently studying** switch locks the end year ("Not applicable") and asks for
 * an optional expected graduation instead: a year saves as the end date, none saves as Present.
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
  // Kept as state because a graduation expected this year is still a year-only end date.
  const [studying, setStudying] = useState(() => isCurrentlyStudying(entry.endDate));
  const setDate = (field: "startDate" | "endDate", value: string) => setValue(`education.${index}.${field}`, value, { shouldDirty: true, shouldValidate: true });
  const start = parseCvDate(entry.startDate);
  const expected = expectedGraduation(entry.endDate);
  const thisYear = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="order-first flex items-center justify-between gap-3">
        <p className="min-w-0 text-[13px] leading-[normal] font-semibold text-ink [overflow-wrap:anywhere]">
          {showHeading ? educationHeading(entry) : ""}
        </p>
        <RemoveButton label={`Remove ${educationHeading(entry)}`} onClick={onRemove} />
      </div>
      <div ref={dateMotionRef} className="flex flex-col gap-2 sm:gap-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          <DatePicker
            label="Start year"
            precision="year"
            value={entry.startDate}
            onChange={(value) => setDate("startDate", value)}
            bounds={dateBounds({ future: false })}
            error={errors?.startDate?.message}
          />
          <div className="flex flex-col items-start gap-2">
            <div className="w-full">
              <DatePicker
                label="End year"
                precision="year"
                value={entry.endDate}
                lockedText={studying ? "Not applicable" : undefined}
                onChange={(value) => setDate("endDate", value)}
                bounds={dateBounds({ future: false, after: start })}
                error={errors?.endDate?.message}
              />
            </div>
            <SwitchRow
              label="Currently studying here"
              hint={studying ? "No end year required" : undefined}
              checked={studying}
              onChange={(checked) => {
                setStudying(checked);
                setDate("endDate", checked ? PRESENT : "");
              }}
            />
          </div>
        </div>
        {studying ? (
          <div className="flex flex-col gap-1.5">
            <DatePicker
              label="Expected graduation (optional)"
              precision="year"
              value={expected}
              onChange={(value) => setDate("endDate", value === "" ? PRESENT : value)}
              bounds={dateBounds({ future: true, after: { year: Math.max(thisYear, start?.year ?? thisYear), month: null } })}
              error={errors?.endDate?.message}
            />
            <p className="hidden text-[11px] leading-normal text-muted sm:block">Forecast year shown on CV · Not a confirmed end date</p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 sm:-order-1">
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
      </div>
      <TextareaField
        label="Details"
        placeholder="Add education details you can confirm"
        rows={3}
        maxLength={300}
        error={errors?.details?.message}
        {...register(`education.${index}.details`)}
      />
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
