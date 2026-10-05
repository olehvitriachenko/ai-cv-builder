"use client";

import { useFormContext, useWatch } from "react-hook-form";
import type { DraftFormValues } from "@/lib/cv/draft-form";
import { ListTextField } from "./list-text-field";
import { SectionCard } from "./section-card";

export function SkillsSection() {
  const { control } = useFormContext<DraftFormValues>();
  const skills = useWatch({ control, name: "skills" })
    .map((item) => item.value.trim())
    .filter((value) => value !== "");

  return (
    <SectionCard
      title="Skills"
      meta={`${skills.length} ${skills.length === 1 ? "skill" : "skills"}`}
      overview={skills.length > 0 ? skills.join(", ") : "No skills yet"}
    >
      <ListTextField name="skills" label="Skills" separator="comma" hint="Separate skills with commas, up to 60." rows={4} />
    </SectionCard>
  );
}
