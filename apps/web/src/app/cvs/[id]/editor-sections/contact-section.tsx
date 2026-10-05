"use client";

import { useFormContext, useWatch } from "react-hook-form";
import { TextField } from "@/components/ui/field";
import type { DraftFormValues } from "@/lib/cv/draft-form";
import { ListTextField } from "./list-text-field";
import { SectionCard } from "./section-card";

export function ContactSection() {
  const { register, control, formState } = useFormContext<DraftFormValues>();
  const errors = formState.errors.contact;
  const contact = useWatch({ control, name: "contact" });
  const identity = [contact.fullName, contact.location].filter((part) => part.trim() !== "").join(" · ");
  const reach = [contact.email, contact.phone].filter((part) => part.trim() !== "").join(" · ");

  return (
    <SectionCard
      title="Contact details"
      overview={
        <>
          <p className="font-medium text-ink">{identity || "No name yet"}</p>
          {reach ? <p>{reach}</p> : null}
        </>
      }
    >
      <TextField label="Full name" autoComplete="off" error={errors?.fullName?.message} {...register("contact.fullName")} />
      <TextField label="Email" type="email" autoComplete="off" error={errors?.email?.message} {...register("contact.email")} />
      <TextField label="Phone" type="tel" autoComplete="off" error={errors?.phone?.message} {...register("contact.phone")} />
      <TextField label="Location" autoComplete="off" error={errors?.location?.message} {...register("contact.location")} />
      <ListTextField name="contact.links" label="Links" separator="newline" hint="One link per line, up to 5." rows={3} />
    </SectionCard>
  );
}
