import { z } from "zod";
import type { CvDraft } from "@/entities/cv/schemas";
import { MAX_TARGET_ROLE_CHARS } from "./create-form";
import { MAX_LINKS, linkError, mergeLinks, splitLinks } from "./links";
import { dateError, parseCvDate, reversedDateRange } from "./dates";

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

export interface SkillCategoryFormEntry {
  id: string;
  name: string;
  skills: ListItem[];
}

export interface DraftFormValues {
  /** The role the CV targets; saved with the draft (same revision). Never empty in a saved CV. */
  targetRole: string;
  contact: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    /** The draft's flat link list as the editor shows it (see `links.ts`); merged back when saving. */
    linkedin: string;
    portfolio: string;
    extraLinks: ListItem[];
  };
  summary: string;
  experience: ExperienceFormEntry[];
  education: EducationFormEntry[];
  skillCategories: SkillCategoryFormEntry[];
}

const orEmpty = (value: string | null): string => value ?? "";
const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};
const nonBlank = (items: ListItem[]): string[] =>
  items.map((item) => item.value.trim()).filter((value) => value !== "");

export function toFormValues(draft: CvDraft, targetRole: string): DraftFormValues {
  const links = splitLinks(draft.contact.links);
  return {
    targetRole,
    contact: {
      fullName: orEmpty(draft.contact.fullName),
      email: orEmpty(draft.contact.email),
      phone: orEmpty(draft.contact.phone),
      location: orEmpty(draft.contact.location),
      linkedin: links.linkedin ?? "",
      portfolio: links.portfolio ?? "",
      extraLinks: links.extra.map((value) => ({ value })),
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
    skillCategories: draft.skillCategories.map((category) => ({
      id: category.id,
      name: category.name,
      skills: category.skills.map((value) => ({ value })),
    })),
  };
}

/** The role to save: trimmed (the schema guarantees it is not empty before a save is sent). */
export function toTargetRole(values: DraftFormValues): string {
  return values.targetRole.trim();
}

/** The end-date value that means "still going"; the experience form offers it as an option. */
export const PRESENT = "Present";

export function isPresent(value: string): boolean {
  return value.trim().toLowerCase() === PRESENT.toLowerCase();
}

/** Education counts as ongoing when it ends in the future or is marked Present. */
export function isCurrentlyStudying(endDate: string, today: Date = new Date()): boolean {
  if (isPresent(endDate)) {
    return true;
  }
  const date = parseCvDate(endDate);
  return date !== null && (date.year > today.getFullYear() || (date.year === today.getFullYear() && date.month !== null && date.month > today.getMonth() + 1));
}

/** The expected graduation shown for an ongoing study: empty while the end is just "Present". */
export function expectedGraduation(endDate: string): string {
  return isPresent(endDate) ? "" : endDate;
}

/** Form values -> the stored draft: trimmed, blank text as `null`, blank list items dropped. */
export function toDraft(values: DraftFormValues): CvDraft {
  return {
    schemaVersion: 2,
    contact: {
      fullName: orNull(values.contact.fullName),
      email: orNull(values.contact.email),
      phone: orNull(values.contact.phone),
      location: orNull(values.contact.location),
      links: mergeLinks({
        linkedin: values.contact.linkedin,
        portfolio: values.contact.portfolio,
        extra: nonBlank(values.contact.extraLinks),
      }),
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
    // The server never stores an empty category, so one without skills is left out of the draft.
    skillCategories: values.skillCategories
      .map((category) => ({ id: category.id, name: category.name.trim(), skills: nonBlank(category.skills) }))
      .filter((category) => category.skills.length > 0),
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

export function newSkillCategory(): SkillCategoryFormEntry {
  return { id: newId(), name: "", skills: [] };
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
    validateDates(entry, context, false);
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
    validateDates(entry, context, true);
    if (entry.institution === "" && entry.qualification === "") {
      context.addIssue({ code: "custom", path: ["institution"], message: "Add an institution or a qualification." });
    }
  });

function validateDates(entry: { startDate: string; endDate: string }, context: z.RefinementCtx, education: boolean) {
  for (const field of ["startDate", "endDate"] as const) {
    if (field === "endDate" && isPresent(entry[field])) continue;
    const message = dateError(entry[field], education && field === "endDate");
    if (message) context.addIssue({ code: "custom", path: [field], message });
  }
  const start = parseCvDate(entry.startDate);
  const end = parseCvDate(entry.endDate);
  if (start && end && reversedDateRange(start, end)) {
    context.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date." });
  }
}

const MAX_SKILL_CATEGORIES = 12;
const MAX_SKILLS = 60;

const skillCategory = z.object({
  id: z.string().min(1),
  name: text(60, "A category name"),
  skills: z.array(listItem(60, "A skill")),
});

const link = (kind: "linkedin" | "portfolio" | "link") =>
  text(200, "A link").superRefine((value, context) => {
    const message = linkError(kind, value);
    if (message !== null) {
      context.addIssue({ code: "custom", message });
    }
  });

const cvFormObject = z.object({
  targetRole: z
    .string()
    .trim()
    .min(1, "Enter the role you’re targeting.")
    .max(MAX_TARGET_ROLE_CHARS, `Keep the role under ${MAX_TARGET_ROLE_CHARS} characters.`),
  contact: z.object({
    fullName: text(120, "Name"),
    email,
    phone: text(40, "Phone"),
    location: text(120, "Location"),
    linkedin: link("linkedin"),
    portfolio: link("portfolio"),
    extraLinks: z.array(z.object({ value: link("link") })),
  }),
  summary: text(1200, "The summary"),
  experience: z.array(experienceEntry).max(30, "At most 30 roles."),
  education: z.array(educationEntry).max(10, "At most 10 education entries."),
  skillCategories: z.array(skillCategory).max(MAX_SKILL_CATEGORIES, `At most ${MAX_SKILL_CATEGORIES} skill categories.`),
});

/**
 * Mirrors the server's write rules for skill categories: a named category when it holds skills,
 * unique category names, a skill listed once in the whole CV (case-insensitive), 60 skills at most.
 */
export const cvFormSchema = cvFormObject.superRefine((values, context) => {
  const names = new Set<string>();
  const skills = new Set<string>();
  let total = 0;

  const linkCount = [
    values.contact.linkedin,
    values.contact.portfolio,
    ...values.contact.extraLinks.map((item) => item.value),
  ].filter((value) => value.trim() !== "").length;
  if (linkCount > MAX_LINKS) {
    context.addIssue({ code: "custom", path: ["contact", "extraLinks"], message: `At most ${MAX_LINKS} links.` });
  }

  values.skillCategories.forEach((category, index) => {
    const name = category.name.trim();
    const held = category.skills.map((item) => item.value.trim()).filter((value) => value !== "");

    if (name === "" && held.length > 0) {
      context.addIssue({ code: "custom", path: ["skillCategories", index, "name"], message: "Name this category." });
    }
    if (name !== "") {
      const key = name.toLowerCase();
      if (names.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["skillCategories", index, "name"],
          message: "Another category already uses this name.",
        });
      }
      names.add(key);
    }
    for (const skill of held) {
      const key = skill.toLowerCase();
      if (skills.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["skillCategories", index, "skills"],
          message: `"${skill}" is listed more than once.`,
        });
      }
      skills.add(key);
    }
    total += held.length;
  });

  if (total > MAX_SKILLS) {
    context.addIssue({ code: "custom", path: ["skillCategories"], message: `At most ${MAX_SKILLS} skills in total.` });
  }
});
