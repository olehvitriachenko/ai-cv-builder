"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextField, TextareaField } from "@/components/ui/field";
import { newExperienceEntry, type DraftFormValues } from "@/lib/cv/draft-form";
import { SectionCard } from "./section-card";

const MAX_BULLETS = 12;
const MAX_ROLES = 30;

function Bullets({ index }: { index: number }) {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: `experience.${index}.bullets` });
  const bulletErrors = formState.errors.experience?.[index]?.bullets;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] font-medium text-ink">Bullet points</p>
      {fields.map((field, bulletIndex) => (
        <div key={field.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <TextareaField
              label={`Bullet ${bulletIndex + 1}`}
              rows={2}
              error={bulletErrors?.[bulletIndex]?.value?.message}
              {...register(`experience.${index}.bullets.${bulletIndex}.value`)}
            />
          </div>
          <button
            type="button"
            aria-label={`Remove bullet ${bulletIndex + 1}`}
            onClick={() => remove(bulletIndex)}
            className="mt-7 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      ))}
      {bulletErrors?.message ? <p className="text-xs text-danger">{bulletErrors.message}</p> : null}
      <Button
        type="button"
        variant="secondary"
        size="compact"
        stretch={false}
        className="self-start"
        disabled={fields.length >= MAX_BULLETS}
        onClick={() => append({ value: "" })}
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={1.75} />
        Add bullet
      </Button>
    </div>
  );
}

export function ExperienceSection() {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "experience" });
  const entries = useWatch({ control, name: "experience" });

  return (
    <SectionCard
      title="Experience"
      meta={`${fields.length} ${fields.length === 1 ? "role" : "roles"}`}
      overview={
        fields.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {entries.map((entry) => (
              <li key={entry.id}>{[entry.title, entry.employer].filter((part) => part.trim() !== "").join(" · ") || "Untitled role"}</li>
            ))}
          </ul>
        ) : (
          "No roles yet"
        )
      }
    >
      {fields.map((field, index) => {
        const errors = formState.errors.experience?.[index];
        return (
          <fieldset key={field.id} className="flex flex-col gap-4 rounded-lg border border-line p-3">
            <legend className="px-1 text-[13px] font-semibold text-ink">Role {index + 1}</legend>
            <TextField label="Job title" error={errors?.title?.message} {...register(`experience.${index}.title`)} />
            <TextField label="Employer" error={errors?.employer?.message} {...register(`experience.${index}.employer`)} />
            <TextField label="Location" error={errors?.location?.message} {...register(`experience.${index}.location`)} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="Start date" error={errors?.startDate?.message} {...register(`experience.${index}.startDate`)} />
              <TextField label="End date" error={errors?.endDate?.message} {...register(`experience.${index}.endDate`)} />
            </div>
            <Bullets index={index} />
            <Button
              type="button"
              variant="text"
              size="compact"
              stretch={false}
              className="self-start text-danger hover:bg-danger-tint"
              onClick={() => remove(index)}
            >
              <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
              Remove role {index + 1}
            </Button>
          </fieldset>
        );
      })}
      {formState.errors.experience?.message ? <p className="text-xs text-danger">{formState.errors.experience.message}</p> : null}
      <Button
        type="button"
        variant="secondary"
        size="compact"
        stretch={false}
        className="self-start"
        disabled={fields.length >= MAX_ROLES}
        onClick={() => append(newExperienceEntry())}
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={1.75} />
        Add role
      </Button>
    </SectionCard>
  );
}
