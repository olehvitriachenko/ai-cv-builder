"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { TextareaField, TextField } from "@/shared/ui/field";
import type { DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { SectionCard } from "../primitives/section-card";
import { RemoveSectionButton } from "./section-actions";

/** A custom section: the person's own title and free text; line breaks are kept. */
export function CustomSectionCard({ index, id, onRemoveSection }: { index: number; id: string; onRemoveSection: () => void }) {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const title = useWatch({ control, name: `customSections.${index}.title` });
  const errors = formState.errors.customSections?.[index];
  const heading = title.trim() === "" ? "Custom section" : title.trim();

  return (
    <SectionCard
      id={`cv-section-custom-${id}`}
      title={heading}
      count="Custom section · Line breaks are kept"
      actions={<RemoveSectionButton title="section" onClick={onRemoveSection} />}
    >
      <TextField
        id={`optional-custom-${id}-first`}
        label="Section title"
        placeholder="e.g. Volunteering"
        autoComplete="off"
        maxLength={60}
        error={errors?.title?.message}
        {...register(`customSections.${index}.title`)}
      />
      <TextareaField
        label="Content"
        placeholder="One item per line"
        rows={5}
        maxLength={1200}
        hint="Saved with a title and some content."
        error={errors?.content?.message}
        {...register(`customSections.${index}.content`)}
      />
    </SectionCard>
  );
}
