import { describe, expect, it } from "vitest";
import {
  canAddCustom,
  customHoldsEntry,
  holdsEntry,
  inDocumentOrder,
  offeredOptions,
  sectionsWithEntries,
  showAddSectionCard,
  type PredefinedKind,
} from "./optional-sections";

const none = { certifications: [], languages: [], hobbies: [], portfolio: [], customSections: [] };

describe("offeredOptions", () => {
  it("offers the four options in the design's order when nothing is added", () => {
    expect(offeredOptions([]).map((option) => option.label)).toEqual(["Certifications", "Languages", "Hobbies", "Portfolio"]);
  });

  it("stops offering an added section and offers it again once it is removed", () => {
    expect(offeredOptions(["languages"]).map((option) => option.kind)).toEqual(["certifications", "hobbies", "portfolio"]);
    expect(offeredOptions([]).map((option) => option.kind)).toContain("languages");
  });
});

describe("the Add a section card", () => {
  it("stays while a custom section can still be added, even with all four added", () => {
    const all: PredefinedKind[] = ["certifications", "languages", "hobbies", "portfolio"];

    expect(showAddSectionCard(all, 0)).toBe(true);
    expect(showAddSectionCard(all, 2)).toBe(true);
  });

  it("disappears when nothing is left to offer", () => {
    expect(showAddSectionCard(["certifications", "languages", "hobbies", "portfolio"], 3)).toBe(false);
  });

  it("offers a custom section up to three", () => {
    expect(canAddCustom(2)).toBe(true);
    expect(canAddCustom(3)).toBe(false);
  });
});

describe("shown sections", () => {
  it("starts with the sections that hold an entry, in document order", () => {
    const values = { ...none, hobbies: [{ value: "Chess" }], languages: [{ id: "l", name: "English", level: "" as const }] };

    expect(sectionsWithEntries(values)).toEqual(["languages", "hobbies"]);
  });

  it("orders added sections like the document, not by when they were added", () => {
    expect(inDocumentOrder(["hobbies", "certifications", "portfolio", "languages"])).toEqual([
      "certifications",
      "languages",
      "portfolio",
      "hobbies",
    ]);
  });
});

describe("holdsEntry", () => {
  it("is false for a card that was added and left blank, so removing it needs no question", () => {
    expect(holdsEntry({ ...none, languages: [{ id: "l", name: " ", level: "" }] }, "languages")).toBe(false);
    expect(holdsEntry({ ...none, hobbies: [{ value: "" }] }, "hobbies")).toBe(false);
    expect(holdsEntry(none, "certifications")).toBe(false);
    expect(customHoldsEntry({ title: " ", content: "" })).toBe(false);
  });

  it("is true once anything is typed, even only a level or an issuer", () => {
    expect(holdsEntry({ ...none, languages: [{ id: "l", name: "", level: "A2" as const }] }, "languages")).toBe(true);
    expect(holdsEntry({ ...none, certifications: [{ id: "c", name: "", issuer: "Amazon", date: "", link: "" }] }, "certifications")).toBe(true);
    expect(holdsEntry({ ...none, portfolio: [{ id: "p", name: "X", link: "", description: "" }] }, "portfolio")).toBe(true);
    expect(customHoldsEntry({ title: "", content: "text" })).toBe(true);
  });
});
