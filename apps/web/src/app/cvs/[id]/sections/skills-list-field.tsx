"use client";

import { useState } from "react";
import { useController, useFormContext } from "react-hook-form";
import { TextareaField } from "@/components/ui/field";
import type { DraftFormValues } from "@/lib/cv/draft-form";

/**
 * A category's skills edited as comma-separated text. TEMPORARY: the category card with its
 * suggestions replaces this in the skills-by-category story. The form keeps `{ value }[]`; blank
 * items are dropped when the draft is built, and the text is kept as typed so a trailing comma is
 * not eaten while the person is still typing.
 */
export function SkillsListField({
  name,
  label,
  hint,
}: {
  name: `skillCategories.${number}.skills`;
  label: string;
  hint?: string;
}) {
  const { control } = useFormContext<DraftFormValues>();
  const { field, fieldState } = useController({ control, name });
  const [text, setText] = useState(() => field.value.map((item) => item.value).join(", "));

  // The array-level message (a duplicate, too many) or the first item's message.
  const itemError = Array.isArray(fieldState.error)
    ? fieldState.error.find((entry) => entry?.value?.message)?.value?.message
    : undefined;
  const error = fieldState.error?.message ?? itemError;

  return (
    <TextareaField
      label={label}
      hint={hint}
      error={error}
      rows={3}
      value={text}
      onBlur={field.onBlur}
      onChange={(event) => {
        setText(event.target.value);
        field.onChange(event.target.value.split(/[,\n]/).map((value) => ({ value })));
      }}
    />
  );
}
