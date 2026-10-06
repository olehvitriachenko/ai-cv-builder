"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { TextField } from "@/shared/ui/field";
import { newCertificationEntry, type DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { dateBounds } from "@/features/cv-editor/lib/date-picker";
import { DatePicker } from "../primitives/date-picker";
import { SectionCard } from "../primitives/section-card";
import { AddEntryButton, RemoveButton, RemoveSectionButton } from "./section-actions";

const MAX_CERTIFICATIONS = 15;

/** Certifications: a name, an issuer, a month and year (date picker) and a link per entry. */
export function CertificationsSection({ onRemoveSection }: { onRemoveSection: () => void }) {
  const { control, register, setValue, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "certifications" });
  const entries = useWatch({ control, name: "certifications" });
  const errors = formState.errors.certifications;
  const count = entries.filter((entry) => entry.name.trim() !== "").length;
  const bounds = dateBounds({ future: false });

  return (
    <SectionCard
      id="cv-section-certifications"
      title="Certifications"
      count={fields.length === 0 ? null : `${count} ${count === 1 ? "certification" : "certifications"}`}
      actions={<RemoveSectionButton title="Certifications" onClick={onRemoveSection} />}
    >
      {fields.map((field, index) => (
        <div key={field.id} className={`flex flex-col gap-4 ${index === 0 ? "" : "border-t border-line pt-4"}`}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                id={index === 0 ? "optional-certifications-first" : undefined}
                label={fields.length > 1 ? `Certification ${index + 1}` : "Certification"}
                placeholder="e.g. AWS Solutions Architect"
                autoComplete="off"
                maxLength={120}
                error={errors?.[index]?.name?.message}
                {...register(`certifications.${index}.name`)}
              />
            </div>
            <div className="pt-6">
              <RemoveButton label={`Remove certification ${index + 1}`} onClick={() => remove(index)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
            <TextField
              label="Issuer"
              placeholder="e.g. Amazon Web Services"
              autoComplete="off"
              maxLength={120}
              error={errors?.[index]?.issuer?.message}
              {...register(`certifications.${index}.issuer`)}
            />
            <DatePicker
              label="Date"
              value={entries[index]?.date ?? ""}
              onChange={(value) => setValue(`certifications.${index}.date`, value, { shouldDirty: true, shouldValidate: true })}
              bounds={bounds}
              error={errors?.[index]?.date?.message}
            />
          </div>
          <TextField
            label="Link"
            inputMode="url"
            placeholder="Add URL"
            autoComplete="off"
            maxLength={200}
            error={errors?.[index]?.link?.message}
            {...register(`certifications.${index}.link`)}
          />
        </div>
      ))}
      {errors?.message ? (
        <p role="alert" className="text-xs text-danger">
          {errors.message}
        </p>
      ) : null}
      <AddEntryButton label="Add Certifications" disabled={fields.length >= MAX_CERTIFICATIONS} onClick={() => append(newCertificationEntry())} />
    </SectionCard>
  );
}
