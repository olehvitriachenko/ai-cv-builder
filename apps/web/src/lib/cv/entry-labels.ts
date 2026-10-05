import { expectedGraduation, isCurrentlyStudying } from "./draft-form";

// Plain-text labels of the structured editor's entries and section count lines, kept out of the
// components so they are tested without a DOM.

const filled = (value: string): boolean => value.trim() !== "";

/** "Kilona · Jun 2025 – Present": the company (or title) and the dates it ran. */
export function experienceHeading(entry: {
  employer: string;
  title: string;
  startDate: string;
  endDate: string;
}): string {
  const name = filled(entry.employer) ? entry.employer.trim() : filled(entry.title) ? entry.title.trim() : "";
  const dates = [entry.startDate, entry.endDate]
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .join(" – ");
  if (name === "") {
    return dates === "" ? "New experience" : dates;
  }
  return dates === "" ? name : `${name} · ${dates}`;
}

export function educationHeading(entry: { institution: string; qualification: string }): string {
  if (filled(entry.institution)) {
    return entry.institution.trim();
  }
  return filled(entry.qualification) ? entry.qualification.trim() : "New education";
}

export function experienceCount(count: number): string {
  if (count === 0) {
    return "No experience added";
  }
  return `${count} ${count === 1 ? "experience" : "experiences"} · Highlights appear in the order below`;
}

export function educationCount(entries: { endDate: string }[], today: Date = new Date()): string {
  if (entries.length === 0) {
    return "No education added";
  }
  const noun = entries.length === 1 ? "education" : "educations";
  const ongoing = entries.some((entry) => isCurrentlyStudying(entry.endDate, today));
  return ongoing ? `${entries.length} ${noun} · Ongoing` : `${entries.length} ${noun}`;
}

/** The line under an ongoing study: "Currently studying · Expected completion in 2029". */
export function studyLine(endDate: string): string {
  const year = expectedGraduation(endDate).trim();
  return year === "" ? "Currently studying" : `Currently studying · Expected completion in ${year}`;
}
