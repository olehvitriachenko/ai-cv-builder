"use client";

import { useFormContext } from "react-hook-form";
import { TextareaField } from "@/shared/ui/field";
import type { DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { SectionCard } from "../primitives/section-card";

/** Professional summary (05.1): the text is edited directly; there is no "Improve with AI" action. */
export function Summary() {
  const { register, formState } = useFormContext<DraftFormValues>();

  return (
    <SectionCard id="cv-section-summary" title="Professional summary">
      <TextareaField
        label="Professional summary"
        labelHidden
        rows={3}
        placeholder="Briefly describe your experience and what you bring."
        className="field-sizing-content placeholder:text-muted!"
        hint="Briefly describe your experience, strongest skills and the value you bring. Keep it focused on the role you want."
        error={formState.errors.summary?.message}
        {...register("summary")}
      />
    </SectionCard>
  );
}
