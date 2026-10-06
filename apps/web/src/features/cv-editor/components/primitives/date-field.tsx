"use client";

import { useId } from "react";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";
import { SelectField, TextField } from "@/shared/ui/field";
import { MIN_CV_YEAR, MONTHS, parseCvDate } from "@/lib/cv/dates";
import type { DraftFormValues } from "@/lib/cv/draft-form";

/** Numeric year and an optional month picker, preserving year-only source dates. */
export function DateField({ label, value, onChange, error, maxYear, yearOnly = false, name }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxYear: number;
  yearOnly?: boolean;
  name: FieldPath<DraftFormValues>;
}) {
  const id = useId();
  const { control } = useFormContext<DraftFormValues>();
  const parsed = parseCvDate(value);
  const partial = /^(\d{2})\/(\d{0,3})$/.exec(value);
  const month = parsed?.month ?? (partial ? Number(partial[1]) : null);
  const year = parsed ? String(parsed.year) : partial ? partial[2] : value;

  function update(nextMonth: number | null, nextYear: string) {
    onChange(nextMonth === null ? nextYear : /^\d{4}$/.test(nextYear) ? `${MONTHS[nextMonth - 1]} ${nextYear}` : `${String(nextMonth).padStart(2, "0")}/${nextYear}`);
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-[13px] leading-[normal] font-medium text-ink">{label}</legend>
      <div className={`grid gap-2 ${yearOnly ? "grid-cols-1" : "grid-cols-2"}`}>
        {yearOnly ? null : (
          <SelectField label={`${label} month`} labelHidden className="min-w-0 pr-7! pl-2! text-xs" value={month ?? ""} onChange={(event) => update(event.target.value === "" ? null : Number(event.target.value), year)}>
            <option value="">Year only</option>
            {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </SelectField>
        )}
        <Controller control={control} name={name} render={({ field }) => <TextField
          id={id}
          name={name}
          ref={field.ref}
          onBlur={field.onBlur}
          label={`${label} year`}
          labelHidden
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="off"
          placeholder="YYYY"
          value={year}
          error={error}
          hint={`${MIN_CV_YEAR}–${maxYear}`}
          onChange={(event) => update(month, event.target.value.replace(/\D/g, "").slice(0, 4))}
        />} />
      </div>
    </fieldset>
  );
}
