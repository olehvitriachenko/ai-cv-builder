"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { TextareaField, TextField } from "@/shared/ui/field";
import { newPortfolioEntry, type DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { SectionCard } from "../primitives/section-card";
import { AddEntryButton, RemoveButton, RemoveSectionButton } from "./section-actions";

const MAX_PORTFOLIO = 8;

/** Portfolio: projects with a name, a link and a short description. */
export function PortfolioSection({ onRemoveSection }: { onRemoveSection: () => void }) {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "portfolio" });
  const entries = useWatch({ control, name: "portfolio" });
  const errors = formState.errors.portfolio;
  const count = entries.filter((entry) => entry.name.trim() !== "").length;

  return (
    <SectionCard
      id="cv-section-portfolio"
      title="Portfolio"
      count={fields.length === 0 ? null : `${count} ${count === 1 ? "project" : "projects"}`}
      actions={<RemoveSectionButton title="Portfolio" onClick={onRemoveSection} />}
    >
      {fields.map((field, index) => (
        <div key={field.id} className={`flex flex-col gap-4 ${index === 0 ? "" : "border-t border-line pt-4"}`}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                id={index === 0 ? "optional-portfolio-first" : undefined}
                label={fields.length > 1 ? `Project ${index + 1}` : "Project"}
                placeholder="e.g. CV Builder"
                autoComplete="off"
                maxLength={120}
                error={errors?.[index]?.name?.message}
                {...register(`portfolio.${index}.name`)}
              />
            </div>
            <div className="pt-6">
              <RemoveButton label={`Remove project ${index + 1}`} onClick={() => remove(index)} />
            </div>
          </div>
          <TextField
            label="Link"
            inputMode="url"
            placeholder="Add URL"
            autoComplete="off"
            maxLength={200}
            error={errors?.[index]?.link?.message}
            {...register(`portfolio.${index}.link`)}
          />
          <TextareaField
            label="Description"
            placeholder="What it is and what you did"
            rows={3}
            maxLength={300}
            error={errors?.[index]?.description?.message}
            {...register(`portfolio.${index}.description`)}
          />
        </div>
      ))}
      {errors?.message ? (
        <p role="alert" className="text-xs text-danger">
          {errors.message}
        </p>
      ) : null}
      <AddEntryButton label="Add Portfolio" disabled={fields.length >= MAX_PORTFOLIO} onClick={() => append(newPortfolioEntry())} />
    </SectionCard>
  );
}
