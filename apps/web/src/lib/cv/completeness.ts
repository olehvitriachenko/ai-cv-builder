import type { DraftFormValues } from "./draft-form";
import { linkError } from "./links";

// The completeness score of the spec appendix: nine items summing to 100%. A pure function of the
// current form values, so it follows every keystroke. Advisory only: it never blocks saving.

export interface MissingItem {
  id: CompletenessItemId;
  label: string;
  /** The percentage points the item adds once it is satisfied. */
  gain: number;
}

export interface Completeness {
  percent: number;
  /** Unsatisfied items in the appendix order. */
  missing: MissingItem[];
}

export type CompletenessItemId =
  | "fullName"
  | "email"
  | "phone"
  | "location"
  | "linkedin"
  | "summary"
  | "experience"
  | "education"
  | "skills";

const filled = (value: string): boolean => value.trim() !== "";

const MIN_SKILLS = 5;

interface Item {
  id: CompletenessItemId;
  label: string;
  weight: number;
  satisfied: (values: DraftFormValues) => boolean;
}

const ITEMS: Item[] = [
  { id: "fullName", label: "Full name", weight: 15, satisfied: (v) => filled(v.contact.fullName) },
  {
    id: "email",
    label: "Email address",
    weight: 10,
    satisfied: (v) => filled(v.contact.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contact.email.trim()),
  },
  { id: "phone", label: "Phone number", weight: 10, satisfied: (v) => filled(v.contact.phone) },
  { id: "location", label: "Location", weight: 5, satisfied: (v) => filled(v.contact.location) },
  {
    id: "linkedin",
    label: "LinkedIn",
    weight: 5,
    satisfied: (v) => filled(v.contact.linkedin) && linkError("linkedin", v.contact.linkedin) === null,
  },
  { id: "summary", label: "Professional summary", weight: 15, satisfied: (v) => filled(v.summary) },
  {
    id: "experience",
    label: "Professional experience",
    weight: 25,
    satisfied: (v) => v.experience.some((e) => filled(e.title) && filled(e.employer) && filled(e.startDate)),
  },
  {
    id: "education",
    label: "Education",
    weight: 5,
    satisfied: (v) => v.education.some((e) => filled(e.institution)),
  },
  {
    id: "skills",
    label: "Skills (at least 5)",
    weight: 10,
    satisfied: (v) =>
      v.skillCategories.reduce((count, category) => count + category.skills.filter((s) => filled(s.value)).length, 0) >=
      MIN_SKILLS,
  },
];

export function computeCompleteness(values: DraftFormValues): Completeness {
  let percent = 0;
  const missing: MissingItem[] = [];
  for (const item of ITEMS) {
    if (item.satisfied(values)) {
      percent += item.weight;
    } else {
      missing.push({ id: item.id, label: item.label, gain: item.weight });
    }
  }
  return { percent, missing };
}
