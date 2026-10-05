import { z } from "zod";
import type { CvDraft } from "@/lib/api/cvs";

// The editor form's shape and rules. The stored model is `CvDraft` and nothing else: these helpers
// only translate it to inputs (null <-> empty string, string lists wrapped as `{ value }` because
// `useFieldArray` needs objects) and back. The caps are the server's (the draft schema); the server
// stays the authority and re-validates every save.

export interface ListItem {
  value: string;
}

export interface ExperienceFormEntry {
  id: string;
  employer: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: ListItem[];
}

export interface EducationFormEntry {
  id: string;
  institution: string;
  qualification: string;
  startDate: string;
  endDate: string;
  details: string;
}

export interface DraftFormValues {
  contact: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    links: ListItem[];
  };
  summary: string;
  experience: ExperienceFormEntry[];
  education: EducationFormEntry[];
  skills: ListItem[];
}

const orEmpty = (value: string | null): string => value ?? "";
const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};
const nonBlank = (items: ListItem[]): string[] =>
  items.map((item) => item.value.trim()).filter((value) => value !== "");

export function toFormValues(draft: CvDraft): DraftFormValues {
  return {
    contact: {
      fullName: orEmpty(draft.contact.fullName),
      email: orEmpty(draft.contact.email),
      phone: orEmpty(draft.contact.phone),
      location: orEmpty(draft.contact.location),
      links: draft.contact.links.map((value) => ({ value })),
    },
    summary: orEmpty(draft.summary),
    experience: draft.experience.map((entry) => ({
      id: entry.id,
      employer: orEmpty(entry.employer),
      title: orEmpty(entry.title),
      location: orEmpty(entry.location),
      startDate: orEmpty(entry.startDate),
      endDate: orEmpty(entry.endDate),
      bullets: entry.bullets.map((value) => ({ value })),
    })),
    education: draft.education.map((entry) => ({
      id: entry.id,
      institution: orEmpty(entry.institution),
      qualification: orEmpty(entry.qualification),
      startDate: orEmpty(entry.startDate),
      endDate: orEmpty(entry.endDate),
      details: orEmpty(entry.details),
    })),
    skills: draft.skills.map((value) => ({ value })),
  };
}

/** Form values -> the stored draft: trimmed, blank text as `null`, blank list items dropped. */
export function toDraft(values: DraftFormValues): CvDraft {
  return {
    schemaVersion: 1,
    contact: {
      fullName: orNull(values.contact.fullName),
      email: orNull(values.contact.email),
      phone: orNull(values.contact.phone),
      location: orNull(values.contact.location),
      links: nonBlank(values.contact.links),
    },
    summary: orNull(values.summary),
    experience: values.experience.map((entry) => ({
      id: entry.id,
      employer: orNull(entry.employer),
      title: orNull(entry.title),
      location: orNull(entry.location),
      startDate: orNull(entry.startDate),
      endDate: orNull(entry.endDate),
      bullets: nonBlank(entry.bullets),
    })),
    education: values.education.map((entry) => ({
      id: entry.id,
      institution: orNull(entry.institution),
      qualification: orNull(entry.qualification),
      startDate: orNull(entry.startDate),
      endDate: orNull(entry.endDate),
      details: orNull(entry.details),
    })),
    skills: nonBlank(values.skills),
  };
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function newExperienceEntry(): ExperienceFormEntry {
  return { id: newId(), employer: "", title: "", location: "", startDate: "", endDate: "", bullets: [] };
}

export function newEducationEntry(): EducationFormEntry {
  return { id: newId(), institution: "", qualification: "", startDate: "", endDate: "", details: "" };
}

const text = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters.`);

const listItem = (max: number, label: string) => z.object({ value: text(max, label) });

const email = z
  .string()
  .trim()
  .max(254, "Email must be at most 254 characters.")
  .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address.");

const experienceEntry = z
  .object({
    id: z.string().min(1),
    employer: text(200, "Employer"),
    title: text(200, "Job title"),
    location: text(120, "Location"),
    startDate: text(40, "Start date"),
    endDate: text(40, "End date"),
    bullets: z.array(listItem(300, "A bullet point")).max(12, "At most 12 bullet points per role."),
  })
  .superRefine((entry, context) => {
    if (entry.employer === "" && entry.title === "") {
      context.addIssue({ code: "custom", path: ["employer"], message: "Add an employer or a job title." });
    }
  });

const educationEntry = z
  .object({
    id: z.string().min(1),
    institution: text(200, "Institution"),
    qualification: text(200, "Qualification"),
    startDate: text(40, "Start date"),
    endDate: text(40, "End date"),
    details: text(300, "Details"),
  })
  .superRefine((entry, context) => {
    if (entry.institution === "" && entry.qualification === "") {
      context.addIssue({ code: "custom", path: ["institution"], message: "Add an institution or a qualification." });
    }
  });

export const cvFormSchema = z.object({
  contact: z.object({
    fullName: text(120, "Name"),
    email,
    phone: text(40, "Phone"),
    location: text(120, "Location"),
    links: z.array(listItem(200, "A link")).max(5, "At most 5 links."),
  }),
  summary: text(1200, "The summary"),
  experience: z.array(experienceEntry).max(30, "At most 30 roles."),
  education: z.array(educationEntry).max(10, "At most 10 education entries."),
  skills: z.array(listItem(60, "A skill")).max(60, "At most 60 skills."),
});
