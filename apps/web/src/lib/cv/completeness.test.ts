import { describe, expect, it } from "vitest";
import type { CvDraft } from "@/lib/api/cvs";
import { computeCompleteness } from "./completeness";
import { toFormValues, type DraftFormValues } from "./draft-form";

function complete(): DraftFormValues {
  const draft: CvDraft = {
    schemaVersion: 2,
    contact: {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+44 7700 900123",
      location: "London",
      links: ["https://www.linkedin.com/in/ada"],
    },
    summary: "Backend engineer.",
    experience: [
      { id: "e1", employer: "Acme", title: "Engineer", location: null, startDate: "2016", endDate: null, bullets: [] },
    ],
    education: [{ id: "d1", institution: "State University", qualification: null, startDate: null, endDate: null, details: null }],
    skillCategories: [{ id: "c1", name: "Backend", skills: ["Node.js", "SQL", "Go", "Rust", "Docker"] }],
  };
  return toFormValues(draft, "Backend Engineer");
}

function ids(values: DraftFormValues): string[] {
  return computeCompleteness(values).missing.map((item) => item.id);
}

describe("computeCompleteness", () => {
  it("scores a complete CV at 100% with nothing missing", () => {
    expect(computeCompleteness(complete())).toEqual({ percent: 100, missing: [] });
  });

  it("scores an empty form at 0% and lists every item in table order with its weight", () => {
    const values = complete();
    values.contact = { fullName: "", email: "", phone: "", location: "", links: [] };
    values.summary = "";
    values.experience = [];
    values.education = [];
    values.skillCategories = [];

    const result = computeCompleteness(values);

    expect(result.percent).toBe(0);
    expect(result.missing.map((item) => [item.id, item.gain])).toEqual([
      ["fullName", 15],
      ["email", 10],
      ["phone", 10],
      ["location", 5],
      ["linkedin", 5],
      ["summary", 15],
      ["experience", 25],
      ["education", 5],
      ["skills", 10],
    ]);
  });

  it("matches the design example: no phone and no LinkedIn gives 85% and two items", () => {
    const values = complete();
    values.contact.phone = "";
    values.contact.links = [];

    const result = computeCompleteness(values);

    expect(result.percent).toBe(85);
    expect(result.missing).toEqual([
      { id: "phone", label: "Phone number", gain: 10 },
      { id: "linkedin", label: "LinkedIn", gain: 5 },
    ]);
  });

  it("treats blank and whitespace-only text as missing", () => {
    const values = complete();
    values.contact.fullName = "   ";
    values.summary = "\n";

    expect(ids(values)).toEqual(["fullName", "summary"]);
  });

  it("needs a valid email address, not just any text", () => {
    const values = complete();
    values.contact.email = "not-an-email";

    expect(ids(values)).toEqual(["email"]);
  });

  it("counts LinkedIn only when a LinkedIn link is present, not any link", () => {
    const values = complete();
    values.contact.links = [{ value: "https://ada.dev" }];

    expect(ids(values)).toEqual(["linkedin"]);
  });

  it("needs an experience entry with a title, a company and a start date", () => {
    for (const change of [
      (entry: DraftFormValues["experience"][number]) => { entry.title = ""; },
      (entry: DraftFormValues["experience"][number]) => { entry.employer = " "; },
      (entry: DraftFormValues["experience"][number]) => { entry.startDate = ""; },
    ]) {
      const values = complete();
      change(values.experience[0]!);
      expect(ids(values)).toEqual(["experience"]);
    }
  });

  it("is satisfied by any one complete experience entry, even next to an incomplete one", () => {
    const values = complete();
    values.experience.push({ ...values.experience[0]!, id: "e2", title: "", startDate: "" });

    expect(ids(values)).toEqual([]);
  });

  it("needs an education entry with an institution", () => {
    const values = complete();
    values.education[0]!.institution = "";
    values.education[0]!.qualification = "BSc";

    expect(ids(values)).toEqual(["education"]);
  });

  it("needs at least five skills in total across categories, ignoring blanks", () => {
    const values = complete();
    values.skillCategories = [
      { id: "a", name: "A", skills: [{ value: "x" }, { value: "y" }, { value: " " }] },
      { id: "b", name: "B", skills: [{ value: "z" }, { value: "w" }] },
    ];
    expect(ids(values)).toEqual(["skills"]);

    values.skillCategories[1]!.skills.push({ value: "v" });
    expect(ids(values)).toEqual([]);
  });

  it("follows edits: filling a missing item raises the score by its weight", () => {
    const values = complete();
    values.contact.phone = "";
    expect(computeCompleteness(values).percent).toBe(90);

    values.contact.phone = "+44 1";
    expect(computeCompleteness(values).percent).toBe(100);
  });
});
