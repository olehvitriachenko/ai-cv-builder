"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { TextareaField } from "@/components/ui/field";
import type { DraftFormValues } from "@/lib/cv/draft-form";
import { SectionCard } from "./section-card";

export function SummarySection() {
  const { register, control, formState } = useFormContext<DraftFormValues>();
  const summary = useWatch({ control, name: "summary" });

  return (
    <SectionCard
      title="Professional summary"
      meta="Editing"
      defaultOpen
      overview={<p className="line-clamp-3">{summary.trim() || "No summary yet"}</p>}
    >
      <TextareaField
        label="Summary"
        rows={6}
        hint="Two or three sentences. Edit directly anytime."
        error={formState.errors.summary?.message}
        {...register("summary")}
      />
    </SectionCard>
  );
}
