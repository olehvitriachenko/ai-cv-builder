"use client";

import { useState } from "react";
import { useController, useFormContext } from "react-hook-form";
import { TextareaField } from "@/components/ui/field";
import type { DraftFormValues } from "@/lib/cv/draft-form";

/**
 * A string list edited as plain text (a category's skills separated by commas, links one per line). The form
 * keeps it as `{ value }[]`; blank items are dropped when the draft is built. The local text is kept
 * as typed so a trailing separator is not eaten while the person is still typing.
 */
export function ListTextField({
  name,
  label,
  separator,
  hint,
  rows = 3,
}: {
  name: "contact.links" | `skillCategories.${number}.skills`;
  label: string;
  separator: "comma" | "newline";
  hint?: string;
  rows?: number;
}) {
  const { control } = useFormContext<DraftFormValues>();
  const { field, fieldState } = useController({ control, name });
  const glue = separator === "comma" ? ", " : "\n";
  const splitter = separator === "comma" ? /[,\n]/ : /\n/;
  const [text, setText] = useState(() => field.value.map((item) => item.value).join(glue));

  // The array-level message (too many items) or the first item's message.
  const itemError = Array.isArray(fieldState.error)
    ? fieldState.error.find((entry) => entry?.value?.message)?.value?.message
    : undefined;
  const error = fieldState.error?.message ?? itemError;

  return (
    <TextareaField
      label={label}
      hint={hint}
      error={error}
      rows={rows}
      value={text}
      onBlur={field.onBlur}
      onChange={(event) => {
        setText(event.target.value);
        field.onChange(event.target.value.split(splitter).map((value) => ({ value })));
      }}
    />
  );
}
