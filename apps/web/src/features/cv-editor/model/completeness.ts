import { z } from "zod";
import type { DraftFormValues } from "./draft-form";
import { splitLinks } from "../lib/links";

// The advisory completeness score of the editor (spec appendix "Completeness score"): the sum of
// the weights of the satisfied items. It runs on the live form values, is never stored or sent, and
// never blocks saving.

export interface MissingItem {
  id: "fullName" | "email" | "phone" | "location" | "linkedin" | "summary" | "experience" | "education" | "skills";
  label: string;
  /** The percentage points the item adds once it is filled in. */
  gain: number;
}

export interface Completeness {
  percent: number;
  missing: MissingItem[];
}

const MIN_SKILLS = 5;

const filled = (value: string): boolean => value.trim() !== "";

export function computeCompleteness(values: DraftFormValues): Completeness {
  const { contact } = values;
  const skillCount = values.skillCategories.reduce(
    (count, category) => count + category.skills.filter((item) => filled(item.value)).length,
    0,
  );

  const items: (MissingItem & { satisfied: boolean })[] = [
    { id: "fullName", label: "Full name", gain: 15, satisfied: filled(contact.fullName) },
    { id: "email", label: "Email", gain: 10, satisfied: z.email().safeParse(contact.email.trim()).success },
    { id: "phone", label: "Phone number", gain: 10, satisfied: filled(contact.phone) },
    { id: "location", label: "Location", gain: 5, satisfied: filled(contact.location) },
    {
      id: "linkedin",
      label: "LinkedIn",
      gain: 5,
      // Judged like the saved draft: a LinkedIn address counts wherever it was typed.
      satisfied: splitLinks([contact.linkedin, contact.portfolio, ...contact.extraLinks.map((item) => item.value)]).linkedin !== null,
    },
    { id: "summary", label: "Professional summary", gain: 15, satisfied: filled(values.summary) },
    {
      id: "experience",
      label: "Work experience",
      gain: 25,
      satisfied: values.experience.some(
        (entry) => filled(entry.title) && filled(entry.employer) && filled(entry.startDate),
      ),
    },
    {
      id: "education",
      label: "Education",
      gain: 5,
      satisfied: values.education.some((entry) => filled(entry.institution)),
    },
    { id: "skills", label: "Skills", gain: 10, satisfied: skillCount >= MIN_SKILLS },
  ];

  return {
    percent: items.filter((item) => item.satisfied).reduce((sum, item) => sum + item.gain, 0),
    missing: items.filter((item) => !item.satisfied).map(({ id, label, gain }) => ({ id, label, gain })),
  };
}
