import { describe, expect, it } from "vitest";
import type { CvDraft } from "@/lib/api/cvs";
import { computeCompleteness } from "./completeness";
import { toFormValues, type DraftFormValues } from "./draft-form";

function fullDraft(): CvDraft {
  return {
    schemaVersion: 2,
    contact: {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+44 20 7946 0000",
      location: "London",
      links: ["https://www.linkedin.com/in/ada"],
    },
    summary: "Backend engineer.",
    experience: [
      { id: "e1", employer: "Acme", title: "Engineer", location: null, startDate: "2016", endDate: null, bullets: [] },
    ],
    education: [{ id: "d1", institution: "State University", qualification: null, startDate: null, endDate: null, details: null }],
    skillCategories: [{ id: "c1", name: "Backend", skills: ["Node.js", "SQL", "Go", "Rust", "Python"] }],
  };
}

const values = (draft: CvDraft = fullDraft()): DraftFormValues => toFormValues(draft, "Backend Engineer");

describe("computeCompleteness", () => {
  it("is 100% with nothing missing for a complete CV", () => {
    expect(computeCompleteness(values())).toEqual({ percent: 100, missing: [] });
  });

  it("is 0% for an empty CV and lists every item in the appendix order with its weight", () => {
    const empty = computeCompleteness(
      values({
        schemaVersion: 2,
        contact: { fullName: null, email: null, phone: null, location: null, links: [] },
        summary: null,
        experience: [],
        education: [],
        skillCategories: [],
      }),
    );

    expect(empty.percent).toBe(0);
    expect(empty.missing.map((item) => [item.id, item.gain])).toEqual([
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
    expect(empty.missing.reduce((sum, item) => sum + item.gain, 0)).toBe(100);
  });

  it("matches the design example: phone and LinkedIn missing gives 85% and two items left", () => {
    const draft = fullDraft();
    draft.contact.phone = null;
    draft.contact.links = [];

    const result = computeCompleteness(values(draft));

    expect(result.percent).toBe(85);
    expect(result.missing).toEqual([
      { id: "phone", label: "Phone number", gain: 10 },
      { id: "linkedin", label: "LinkedIn", gain: 5 },
    ]);
  });

  it("counts an email only when it is present and valid", () => {
    const draft = fullDraft();
    draft.contact.email = "ada@";
    const form = values(draft);

    expect(computeCompleteness(form).missing.map((item) => item.id)).toEqual(["email"]);
    form.contact.email = "   ";
    expect(computeCompleteness(form).missing.map((item) => item.id)).toEqual(["email"]);
  });

  it("counts LinkedIn only for a LinkedIn link, not for another site", () => {
    const draft = fullDraft();
    draft.contact.links = ["https://github.com/ada"];

    expect(computeCompleteness(values(draft)).missing.map((item) => item.id)).toEqual(["linkedin"]);
  });

  it("needs an experience entry with a title, a company and a start date", () => {
    for (const change of [
      (entry: DraftFormValues["experience"][number]) => { entry.title = ""; },
      (entry: DraftFormValues["experience"][number]) => { entry.employer = " "; },
      (entry: DraftFormValues["experience"][number]) => { entry.startDate = ""; },
    ]) {
      const form = values();
      const entry = form.experience[0];
      if (entry) {
        change(entry);
      }
      expect(computeCompleteness(form).missing.map((item) => item.id)).toEqual(["experience"]);
    }
  });

  it("is satisfied by any one complete experience entry", () => {
    const form = values();
    form.experience.unshift({ id: "x", employer: "", title: "", location: "", startDate: "", endDate: "", bullets: [] });

    expect(computeCompleteness(form).missing).toEqual([]);
  });

  it("needs an education entry with an institution", () => {
    const form = values();
    const entry = form.education[0];
    if (entry) {
      entry.institution = "";
      entry.qualification = "BSc";
    }

    expect(computeCompleteness(form).missing.map((item) => item.id)).toEqual(["education"]);
  });

  it("needs at least five skills in total across categories, ignoring blanks", () => {
    const form = values();
    form.skillCategories = [
      { id: "a", name: "A", skills: [{ value: "one" }, { value: "two" }, { value: " " }] },
      { id: "b", name: "B", skills: [{ value: "three" }, { value: "four" }] },
    ];
    expect(computeCompleteness(form).missing.map((item) => item.id)).toEqual(["skills"]);

    form.skillCategories[1]?.skills.push({ value: "five" });
    expect(computeCompleteness(form).missing).toEqual([]);
  });

  it("follows the edits: typing a phone number raises the score by its weight", () => {
    const draft = fullDraft();
    draft.contact.phone = null;
    const form = values(draft);
    expect(computeCompleteness(form).percent).toBe(90);

    form.contact.phone = "+1 555 0100";

    expect(computeCompleteness(form).percent).toBe(100);
  });
});
