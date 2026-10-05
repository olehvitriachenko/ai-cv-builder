"use client";

import { BriefcaseBusiness } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { experienceCount } from "@/lib/cv/entry-labels";
import { newExperienceEntry, type DraftFormValues } from "@/lib/cv/draft-form";
import { EmptySection } from "./empty-section";
import { ExperienceEntry } from "./experience-entry";
import { SectionCard } from "./section-card";

const MAX_ROLES = 30;

/** Professional experience (05.1/06.1): every role open, add and remove at once, empty state. */
export function Experience() {
  const { control, formState, trigger } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "experience" });
  const sectionError = formState.errors.experience?.message;

  // A new role cannot be saved until it has an employer or a title, so say so on the field at once.
  function addRole() {
    const index = fields.length;
    append(newExperienceEntry());
    setTimeout(() => void trigger(`experience.${index}.employer`), 0);
  }

  const add = (
    <Button
      type="button"
      variant={fields.length === 0 ? "primary" : "text"}
      stretch={false}
      className={fields.length === 0 ? "" : "w-full"}
      disabled={fields.length >= MAX_ROLES}
      onClick={addRole}
    >
      {fields.length === 0 ? "+ Add experience" : "+ Add professional experience"}
    </Button>
  );

  return (
    <SectionCard id="cv-section-experience" title="Professional experience" count={experienceCount(fields.length)}>
      {fields.length === 0 ? (
        <EmptySection
          icon={BriefcaseBusiness}
          title="No experience added"
          text="Add only details you can confirm. Nothing is added automatically."
          action={add}
        />
      ) : (
        <>
          {fields.map((field, index) => (
            <div key={field.id} className={index === 0 ? "" : "border-t border-line pt-4"}>
              <ExperienceEntry index={index} showHeading={fields.length > 1} onRemove={() => remove(index)} />
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
      <p className="text-xs leading-normal text-muted">
        Add a measurable performance result only if you can confirm it. AI will not invent a metric.
      </p>
    </SectionCard>
  );
}
