"use client";

import { useId, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/field";
import type { DraftFormValues } from "@/lib/cv/draft-form";

const MAX_HIGHLIGHTS = 12;

function HighlightRow({
  experienceIndex,
  index,
  onRemove,
}: {
  experienceIndex: number;
  index: number;
  onRemove: () => void;
}) {
  const { register, formState } = useFormContext<DraftFormValues>();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const field = register(`experience.${experienceIndex}.bullets.${index}.value`);
  const error = formState.errors.experience?.[experienceIndex]?.bullets?.[index]?.value?.message;
  const number = index + 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p aria-hidden className="text-[13px] leading-[normal] font-medium text-ink">
          Highlight {number}
        </p>
        <button
          type="button"
          aria-label={`Remove highlight ${number}`}
          onClick={onRemove}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-accent hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden className="text-sm leading-none font-semibold">
            ×
          </span>
        </button>
      </div>
      <TextareaField
        id={id}
        label={`Highlight ${number}`}
        labelHidden
        rows={3}
        hint={focused ? "Editing this highlight only. Each highlight is added or removed independently." : undefined}
        error={error}
        {...field}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          setFocused(false);
          void field.onBlur(event);
        }}
      />
    </div>
  );
}

/** The highlights (bullet points) of one role: numbered rows, immediate removal, at most 12. */
export function Highlights({ experienceIndex }: { experienceIndex: number }) {
  const { control, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: `experience.${experienceIndex}.bullets` });
  const arrayError = formState.errors.experience?.[experienceIndex]?.bullets?.message;
  const atLimit = fields.length >= MAX_HIGHLIGHTS;

  return (
    <div className="flex flex-col gap-4">
      {fields.length === 0 ? <p className="text-xs leading-normal text-muted">No highlights yet.</p> : null}
      {fields.map((field, index) => (
        <HighlightRow
          key={field.id}
          experienceIndex={experienceIndex}
          index={index}
          onRemove={() => remove(index)}
        />
      ))}
      {arrayError ? (
        <p role="alert" className="text-xs text-danger">
          {arrayError}
        </p>
      ) : null}
      <div className="flex flex-col items-start gap-1">
        <Button
          type="button"
          variant="text"
          stretch={false}
          disabled={atLimit}
          onClick={() => append({ value: "" })}
        >
          + Add bullet
        </Button>
        {atLimit ? (
          <p className="text-xs leading-normal text-muted">Maximum of {MAX_HIGHLIGHTS} highlights reached.</p>
        ) : null}
      </div>
    </div>
  );
}
