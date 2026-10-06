"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/field";
import type { DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { MAX_LINKS } from "@/features/cv-editor/lib/links";
import { computeCompleteness } from "@/features/cv-editor/model/completeness";
import { RemoveButton } from "../primitives/remove-button";
import { SectionCard } from "../primitives/section-card";

// The design's placeholders use the muted ink (06.2: "placeholder replacement is existing Muted").
const PLACEHOLDER = "placeholder:text-muted!";

/** "+10% completeness" under an empty field that counts toward the score; the phone design only. */
function MissingHint({ gain }: { gain: number | null }) {
  if (gain === null) return null;
  return (
    <p className="flex items-center gap-1 text-[11px] leading-[normal] text-accent sm:hidden">
      <span aria-hidden className="size-1 shrink-0 rounded-full bg-accent" />+{gain}% completeness
    </p>
  );
}

/** Personal details: target role, name, contact, LinkedIn, portfolio and further links (05.1). */
export function PersonalDetails() {
  const { control, register, formState, watch } = useFormContext<DraftFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "contact.extraLinks",
  });
  const contact = useWatch({ control, name: "contact" });
  const errors = formState.errors;
  const contactErrors = errors.contact;

  // The phone design marks what would add to the completeness score (+10% phone, +5% LinkedIn).
  const missing = computeCompleteness(watch()).missing;
  const gainOf = (id: "phone" | "linkedin"): number | null => missing.find((item) => item.id === id)?.gain ?? null;
  const phoneGain = gainOf("phone");
  const linkedinGain = gainOf("linkedin");
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
        <div className="flex flex-col gap-1">
          <TextField
            label="Phone"
            type="tel"
            placeholder="Add phone number"
            autoComplete="off"
            className={`${PLACEHOLDER} ${phoneGain !== null ? "max-sm:border-[#dcddf5]!" : ""}`}
            error={contactErrors?.phone?.message}
            {...register("contact.phone")}
          />
          <MissingHint gain={phoneGain} />
        </div>
      </div>
      <TextField
        label="Location"
        placeholder="Add location"
        autoComplete="off"
        className={PLACEHOLDER}
        error={contactErrors?.location?.message}
        {...register("contact.location")}
      />
      <div className="flex flex-col gap-1">
        <TextField
          label="LinkedIn"
          inputMode="url"
          placeholder="Add LinkedIn URL"
          autoComplete="off"
          className={`${PLACEHOLDER} ${linkedinGain !== null ? "max-sm:border-[#dcddf5]!" : ""}`}
          error={contactErrors?.linkedin?.message}
          {...register("contact.linkedin")}
        />
        <MissingHint gain={linkedinGain} />
      </div>
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
