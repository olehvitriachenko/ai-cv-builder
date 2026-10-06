import { expectedGraduation, isCurrentlyStudying } from "../model/draft-form";

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

/** Whether a role holds anything the person typed; an untouched new role needs no confirmation to remove. */
export function experienceHasContent(entry: {
  employer: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: readonly { value: string }[];
}): boolean {
  return (
    [entry.employer, entry.title, entry.location, entry.startDate, entry.endDate].some(filled) ||
    entry.bullets.some((bullet) => filled(bullet.value))
  );
}

/** The sentence under "Remove this experience?": what else goes with the role. */
export function experienceRemovalText(entry: { bullets: readonly { value: string }[] }): string {
  const highlights = entry.bullets.filter((bullet) => filled(bullet.value)).length;
  if (highlights === 0) {
    return "This removes the experience from this CV.";
  }
  if (highlights === 1) {
    return "This removes the experience and its highlight from this CV.";
  }
  return highlights === 2
    ? "This removes the experience and both highlights from this CV."
    : `This removes the experience and all ${highlights} highlights from this CV.`;
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

export function educationCount(entries: { endDate: string; ongoing?: boolean }[], today: Date = new Date()): string {
  if (entries.length === 0) {
    return "No education added";
  }
  const noun = entries.length === 1 ? "education" : "educations";
  const ongoing = entries.some((entry) => isCurrentlyStudying(entry.endDate, today, entry.ongoing));
  return ongoing ? `${entries.length} ${noun} · Ongoing` : `${entries.length} ${noun}`;
}

/** The line under an ongoing study: "Currently studying · Expected completion in 2029". */
export function studyLine(endDate: string): string {
  const year = expectedGraduation(endDate).trim();
  return year === "" ? "Currently studying" : `Currently studying · Expected completion in ${year}`;
}
