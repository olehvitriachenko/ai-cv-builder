"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/field";
import type { DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { MAX_LINKS } from "@/features/cv-editor/lib/links";
import { RemoveButton } from "../primitives/remove-button";
import { SectionCard } from "../primitives/section-card";

// The design's placeholders use the muted ink (06.2: "placeholder replacement is existing Muted").
const PLACEHOLDER = "placeholder:text-muted!";

/** Personal details: target role, name, contact, LinkedIn, portfolio and further links (05.1). */
export function PersonalDetails() {
  const { control, register, formState } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "contact.extraLinks",
  });
  const contact = useWatch({ control, name: "contact" });
  const errors = formState.errors;
  const contactErrors = errors.contact;

  const filledLinks = [contact.linkedin, contact.portfolio].filter(
    (value) => value.trim() !== "",
  ).length;
  const atLinkLimit = filledLinks + fields.length >= MAX_LINKS;

  return (
    <SectionCard id="cv-section-contact" title="Personal details">
      <TextField
        label="Target role"
        placeholder="Enter target role"
        autoComplete="off"
        className={PLACEHOLDER}
        error={errors.targetRole?.message}
        {...register("targetRole")}
      />
      <TextField
        label="Full name"
        placeholder="Enter full name"
        autoComplete="off"
        className={PLACEHOLDER}
        error={contactErrors?.fullName?.message}
        {...register("contact.fullName")}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3">
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="off"
          className={PLACEHOLDER}
          error={contactErrors?.email?.message}
          {...register("contact.email")}
        />
        <TextField
          label="Phone"
          type="tel"
          placeholder="Add phone number"
          autoComplete="off"
          className={PLACEHOLDER}
          error={contactErrors?.phone?.message}
          {...register("contact.phone")}
        />
      </div>
      <TextField
        label="Location"
        placeholder="Add location"
        autoComplete="off"
        className={PLACEHOLDER}
        error={contactErrors?.location?.message}
        {...register("contact.location")}
      />
      <TextField
        label="LinkedIn"
        inputMode="url"
        placeholder="Add LinkedIn URL"
        autoComplete="off"
        className={PLACEHOLDER}
        error={contactErrors?.linkedin?.message}
        {...register("contact.linkedin")}
      />
      <TextField
        label="Portfolio"
        inputMode="url"
        placeholder="Optional · Add portfolio URL"
        autoComplete="off"
        className={PLACEHOLDER}
        error={contactErrors?.portfolio?.message}
        {...register("contact.portfolio")}
      />
      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-col items-start gap-2">
          <div className="flex w-full items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label={`Link ${index + 1}`}
                inputMode="url"
                placeholder="Add URL"
                autoComplete="off"
                className={PLACEHOLDER}
                error={contactErrors?.extraLinks?.[index]?.value?.message}
                {...register(`contact.extraLinks.${index}.value`)}
              />
            </div>
            <div className="pt-6">
              <RemoveButton
                label={`Remove link ${index + 1}`}
                onClick={() => remove(index)}
              />
            </div>
          </div>
        </div>
      ))}
      {contactErrors?.extraLinks?.message ? (
        <p role="alert" className="text-xs text-danger">
          {contactErrors.extraLinks.message}
        </p>
      ) : null}
      <Button
        type="button"
        variant="text"
        stretch={false}
        className="self-start"
        disabled={atLinkLimit}
        onClick={() => append({ value: "" })}
      >
        + Add link
      </Button>
    </SectionCard>
  );
}
