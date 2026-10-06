"use client";

import { Button } from "@/shared/ui/button";
import { Combobox } from "@/features/cv-editor/components/skills/combobox";
import { FieldFrame } from "@/shared/ui/field";
import { RemoveButton } from "../primitives/remove-button";
import { CATEGORY_COMBOBOX } from "./skill-category-card";

/**
 * "Category card / New category" (Figma): the last card, where the next category is chosen. Its
 * skills field and Add stay disabled ("Select a category first") until a category is chosen; the
 * choice turns it into a category card and a new empty card follows.
 */
export function NewCategoryCard({
  options,
  message,
  onChoose,
  onDismiss,
}: {
  options: readonly string[];
  message: string | null;
  onChoose: (name: string) => void;
  /** Removes the empty card; "+ Add skills" brings it back. */
  onDismiss: () => void;
}) {
  return (
    <section aria-label="New category" className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4">
      <Combobox
        label="Category Name"
        value={null}
        placeholder="Select category"
        options={options}
        {...CATEGORY_COMBOBOX}
        onSelect={onChoose}
        trailing={
          <RemoveButton label="Remove empty category" onClick={onDismiss} />
        }
      />
      {message ? (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      ) : null}
      <FieldFrame label="Skills" controlId="skills-input-new">
        <div className="flex gap-2">
          <input
            id="skills-input-new"
            type="text"
            disabled
            placeholder="Select a category first"
            className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-placeholder disabled:cursor-not-allowed"
          />
          <Button type="button" variant="secondary" stretch={false} disabled>
            + Add
          </Button>
        </div>
      </FieldFrame>
    </section>
  );
}
