import type { CertificationEntry, CustomSection, LanguageEntry } from "@/entities/cv/schemas";

// The text of the optional sections as the document prints it. The PDF export builds the same
// strings on the server, so the preview and the downloaded file read the same.

/** "English — C1"; a language without a level is just its name. */
export function languageText(entry: LanguageEntry): string {
  return entry.level === null ? entry.name : `${entry.name} — ${entry.level}`;
}

/** The languages as one line: "English — C1 · German". */
export function languagesLine(entries: readonly LanguageEntry[]): string {
  return entries.map(languageText).join(" · ");
}

/** "Amazon Web Services · Jun 2024", or what is there; null when neither is. */
export function certificationLine(entry: CertificationEntry): string | null {
  const parts = [entry.issuer, entry.date].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The hobbies as one line: "Chess · Climbing". */
export function hobbiesLine(items: readonly string[]): string {
  return items.join(" · ");
}

/** A custom section's content as lines: line breaks kept, blank lines dropped. */
export function contentLines(section: CustomSection): string[] {
  return section.content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
}
