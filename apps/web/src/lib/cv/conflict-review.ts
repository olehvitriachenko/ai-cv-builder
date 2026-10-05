import type { CvDraft, EducationEntry, ExperienceEntry } from "@/lib/api/cvs";
import { isCurrentlyStudying, isPresent } from "./draft-form";

// "Review conflicting versions" (Figma 09.3 to 09.5): the document the person is editing and the
// newer one saved elsewhere, compared section by section so they can choose a whole version. This
// only describes the two sides, it never merges them: each side keeps its own text.

export interface VersionContent {
  targetRole: string;
  draft: CvDraft;
}

export interface SectionSide {
  /** "Unchanged in both versions", "Changed · Highlights", "Difference · Highlights", "Only in your draft"… */
  status: string;
  /** The section's content as text lines; a line starting with "•" is a highlight. */
  lines: string[];
}

export interface ReviewSection {
  key: string;
  title: string;
  changed: boolean;
  local: SectionSide;
  saved: SectionSide;
}

const clean = (value: string | null | undefined): string => (value ?? "").trim();
const present = (parts: (string | null | undefined)[]): string[] => parts.map(clean).filter((part) => part !== "");

function naturalList(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

interface Field<T> {
  label: string;
  read: (value: T) => string;
}

function differingLabels<T>(local: T, saved: T, fields: readonly Field<T>[]): string[] {
  return fields.filter((field) => field.read(local) !== field.read(saved)).map((field) => field.label);
}

function sides(labels: string[], unchangedStatus: string, local: string[], saved: string[]): { changed: boolean; local: SectionSide; saved: SectionSide } {
  if (labels.length === 0) {
    return { changed: false, local: { status: unchangedStatus, lines: local }, saved: { status: unchangedStatus, lines: saved } };
  }
  const what = sentence(naturalList(labels));
  return {
    changed: true,
    local: { status: `Changed · ${what}`, lines: local },
    saved: { status: `Difference · ${what}`, lines: saved },
  };
}

const dateRange = (start: string | null, end: string | null): string => present([start, end]).join(" – ");

// ---- personal details

const PERSONAL_FIELDS: readonly Field<VersionContent>[] = [
  { label: "target role", read: (v) => clean(v.targetRole) },
  { label: "name", read: (v) => clean(v.draft.contact.fullName) },
  { label: "email", read: (v) => clean(v.draft.contact.email) },
  { label: "phone", read: (v) => clean(v.draft.contact.phone) },
  { label: "location", read: (v) => clean(v.draft.contact.location) },
  { label: "links", read: (v) => v.draft.contact.links.map(clean).filter((link) => link !== "").join("\n") },
];

function personalLines(version: VersionContent): string[] {
  const { contact } = version.draft;
  const lines = present([present([contact.location, contact.email, contact.phone]).join(" · ")]);
  const hasLinkedIn = contact.links.some((link) => /linkedin\.com/i.test(link));
  const missing = [clean(contact.phone) === "" ? "Phone" : null, hasLinkedIn ? null : "LinkedIn"].filter(
    (name): name is string => name !== null,
  );
  const notes = present([
    missing.length > 0 ? `${naturalList(missing)} not added` : null,
    contact.links.length === 0 ? "Portfolio optional, blank" : null,
  ]);
  if (notes.length > 0) {
    lines.push(notes.join(" · "));
  }
  const links = contact.links.map(clean).filter((link) => link !== "");
  if (links.length > 0) {
    lines.push(`Links: ${links.join(" · ")}`);
  }
  return lines;
}

// ---- entries

const EXPERIENCE_FIELDS: readonly Field<ExperienceEntry>[] = [
  { label: "job title", read: (e) => clean(e.title) },
  { label: "company", read: (e) => clean(e.employer) },
  { label: "location", read: (e) => clean(e.location) },
  { label: "dates", read: (e) => dateRange(e.startDate, e.endDate) },
  { label: "highlights", read: (e) => e.bullets.map(clean).filter((bullet) => bullet !== "").join("\n") },
];

function experienceLines(entry: ExperienceEntry): string[] {
  return [
    present([entry.title, dateRange(entry.startDate, entry.endDate)]).join(" · "),
    ...entry.bullets.map(clean).filter((bullet) => bullet !== "").map((bullet) => `• ${bullet}`),
  ].filter((line) => line !== "");
}

const EDUCATION_FIELDS: readonly Field<EducationEntry>[] = [
  { label: "institution", read: (e) => clean(e.institution) },
  { label: "degree", read: (e) => clean(e.qualification) },
  { label: "dates", read: (e) => dateRange(e.startDate, e.endDate) },
  { label: "details", read: (e) => clean(e.details) },
];

function educationLines(entry: EducationEntry): string[] {
  const studying = entry.endDate !== null && isCurrentlyStudying(entry.endDate);
  const expected = studying && entry.endDate !== null && !isPresent(entry.endDate);
  const range = dateRange(entry.startDate, entry.endDate);
  return [
    present([entry.qualification, entry.institution]).join(" · "),
    present([range === "" ? null : expected ? `${range} (expected)` : range, studying ? "Currently studying" : null]).join(" · "),
    clean(entry.details),
  ].filter((line) => line !== "");
}

function entrySection<T extends { id: string }>(
  key: string,
  title: string,
  local: T | undefined,
  saved: T | undefined,
  fields: readonly Field<T>[],
  lines: (entry: T) => string[],
): ReviewSection {
  if (local !== undefined && saved === undefined) {
    return {
      key,
      title,
      changed: true,
      local: { status: "Only in your draft", lines: lines(local) },
      saved: { status: "Not in the saved version", lines: [] },
    };
  }
  if (local === undefined && saved !== undefined) {
    return {
      key,
      title,
      changed: true,
      local: { status: "Not in your draft", lines: [] },
      saved: { status: "Only in the saved version", lines: lines(saved) },
    };
  }
  if (local === undefined || saved === undefined) {
    throw new Error("An entry section needs at least one side");
  }
  return { key, title, ...sides(differingLabels(local, saved, fields), "Unchanged in both versions", lines(local), lines(saved)) };
}

function skillLines(draft: CvDraft): string[] {
  return draft.skillCategories
    .map((category) => ({ name: clean(category.name), skills: category.skills.map(clean).filter((skill) => skill !== "") }))
    .filter((category) => category.skills.length > 0)
    .map((category) => `${category.name}: ${category.skills.join(", ")}`);
}

const skillCount = (draft: CvDraft): number =>
  draft.skillCategories.reduce((count, category) => count + category.skills.filter((skill) => clean(skill) !== "").length, 0);

/** Compares the two versions section by section: personal details, summary, each role, each study, skills. */
export function diffSections(local: VersionContent, saved: VersionContent): ReviewSection[] {
  const sections: ReviewSection[] = [];

  sections.push({
    key: "personal",
    title: "Personal details",
    ...sides(differingLabels(local, saved, PERSONAL_FIELDS), "Unchanged in both versions", personalLines(local), personalLines(saved)),
  });

  const summaryLines = (version: VersionContent): string[] => present([version.draft.summary]);
  sections.push({
    key: "summary",
    title: "Professional summary",
    ...sides(
      clean(local.draft.summary) === clean(saved.draft.summary) ? [] : ["wording"],
      "Unchanged in both versions",
      summaryLines(local),
      summaryLines(saved),
    ),
  });

  const roleIds = [...new Set([...local.draft.experience, ...saved.draft.experience].map((entry) => entry.id))];
  for (const id of roleIds) {
    const mine = local.draft.experience.find((entry) => entry.id === id);
    const theirs = saved.draft.experience.find((entry) => entry.id === id);
    const name = clean(mine?.employer) || clean(theirs?.employer) || clean(mine?.title) || clean(theirs?.title) || "Untitled role";
    sections.push(entrySection(`experience:${id}`, `Experience / ${name}`, mine, theirs, EXPERIENCE_FIELDS, experienceLines));
  }

  const studyIds = [...new Set([...local.draft.education, ...saved.draft.education].map((entry) => entry.id))];
  for (const id of studyIds) {
    const mine = local.draft.education.find((entry) => entry.id === id);
    const theirs = saved.draft.education.find((entry) => entry.id === id);
    const name = clean(mine?.institution) || clean(theirs?.institution) || clean(mine?.qualification) || clean(theirs?.qualification) || "Untitled study";
    sections.push(entrySection(`education:${id}`, `Education / ${name}`, mine, theirs, EDUCATION_FIELDS, educationLines));
  }

  const mineSkills = skillLines(local.draft);
  const theirSkills = skillLines(saved.draft);
  const skillCountText = `Unchanged · ${skillCount(local.draft)} selected ${skillCount(local.draft) === 1 ? "skill" : "skills"}`;
  sections.push({
    key: "skills",
    title: "Skills",
    ...sides(mineSkills.join("\n") === theirSkills.join("\n") ? [] : ["categories and skills"], skillCountText, mineSkills, theirSkills),
  });

  return sections;
}

/** "Experience / Kilona differs · All other sections unchanged · Local draft retained" */
export function reviewSummary(sections: readonly ReviewSection[]): string {
  const differing = sections.filter((section) => section.changed);
  if (differing.length === 0) {
    return "Both versions have the same content · Local draft retained";
  }
  const names = naturalList(differing.map((section) => section.title));
  const parts = [`${names} ${differing.length === 1 ? "differs" : "differ"}`];
  if (differing.length < sections.length) {
    parts.push("All other sections unchanged");
  }
  parts.push("Local draft retained");
  return parts.join(" · ");
}

export function versionHeading(version: VersionContent): { name: string; role: string } {
  return { name: clean(version.draft.contact.fullName) || "Name not provided", role: clean(version.targetRole) };
}
