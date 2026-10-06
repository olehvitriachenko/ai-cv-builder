import { MAX_CUSTOM_SECTIONS, type DraftFormValues } from "./draft-form";

// Which optional sections the editor offers and shows (Figma "Add a section"). Pure rules, so they
// are tested without a DOM. A section is shown while it holds an entry or while the person has
// added it and not yet filled it; it is stored only with entries (see `toDraft`).

export type PredefinedKind = "certifications" | "languages" | "hobbies" | "portfolio";

/** The options in the order the design lists them. */
export const PREDEFINED_OPTIONS: readonly { kind: PredefinedKind; label: string }[] = [
  { kind: "certifications", label: "Certifications" },
  { kind: "languages", label: "Languages" },
  { kind: "hobbies", label: "Hobbies" },
  { kind: "portfolio", label: "Portfolio" },
];

/** The order the sections have in the editor and the document (custom sections follow). */
export const DOCUMENT_ORDER: readonly PredefinedKind[] = ["certifications", "languages", "portfolio", "hobbies"];

type SectionValues = Pick<DraftFormValues, PredefinedKind | "customSections">;

/** The predefined sections that already hold an entry, as the editor opens. */
export function sectionsWithEntries(values: SectionValues): PredefinedKind[] {
  return DOCUMENT_ORDER.filter((kind) => values[kind].length > 0);
}

/** The options still to offer: every predefined section that is not shown, in the design's order. */
export function offeredOptions(shown: readonly PredefinedKind[]): { kind: PredefinedKind; label: string }[] {
  return PREDEFINED_OPTIONS.filter((option) => !shown.includes(option.kind));
}

export function canAddCustom(customCount: number): boolean {
  return customCount < MAX_CUSTOM_SECTIONS;
}

/** The card is shown while it can still offer something. */
export function showAddSectionCard(shown: readonly PredefinedKind[], customCount: number): boolean {
  return offeredOptions(shown).length > 0 || canAddCustom(customCount);
}

/** Shown sections in document order, whatever order they were added in. */
export function inDocumentOrder(shown: readonly PredefinedKind[]): PredefinedKind[] {
  return DOCUMENT_ORDER.filter((kind) => shown.includes(kind));
}

const filled = (value: string): boolean => value.trim() !== "";

/** Whether a section holds anything the person typed, which is what removing it must ask about. */
export function holdsEntry(values: SectionValues, kind: PredefinedKind): boolean {
  switch (kind) {
    case "languages":
      return values.languages.some((entry) => filled(entry.name) || entry.level !== "");
    case "certifications":
      return values.certifications.some((entry) => [entry.name, entry.issuer, entry.date, entry.link].some(filled));
    case "portfolio":
      return values.portfolio.some((entry) => [entry.name, entry.link, entry.description].some(filled));
    case "hobbies":
      return values.hobbies.some((item) => filled(item.value));
  }
}

export function customHoldsEntry(section: { title: string; content: string }): boolean {
  return filled(section.title) || filled(section.content);
}
