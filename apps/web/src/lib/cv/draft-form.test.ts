import { describe, expect, it } from "vitest";
import type { CvDraft } from "@/lib/api/cvs";
import { cvFormSchema, newEducationEntry, newExperienceEntry, toDraft, toFormValues } from "./draft-form";

function draft(): CvDraft {
  return {
    schemaVersion: 1,
    contact: { fullName: "Ada Lovelace", email: "ada@example.com", phone: null, location: "London", links: ["github.com/ada"] },
    summary: "Backend engineer.",
    experience: [
      { id: "exp-1", employer: "Acme", title: "Engineer", location: null, startDate: "2016", endDate: null, bullets: ["Built APIs", "Led a team"] },
    ],
    education: [
      { id: "edu-1", institution: "State University", qualification: null, startDate: null, endDate: "2015", details: null },
    ],
    skills: ["Node.js", "SQL"],
  };
}

describe("toFormValues / toDraft", () => {
  it("round-trips a draft unchanged", () => {
    expect(toDraft(toFormValues(draft()))).toEqual(draft());
  });

  it("shows null as an empty input", () => {
    const values = toFormValues(draft());

    expect(values.contact.phone).toBe("");
    expect(values.experience[0]?.location).toBe("");
    expect(values.summary).toBe("Backend engineer.");
  });

  it("sends an emptied or whitespace-only field as null", () => {
    const values = toFormValues(draft());
    values.summary = "   ";
    values.contact.email = "";

    const result = toDraft(values);

    expect(result.summary).toBeNull();
    expect(result.contact.email).toBeNull();
  });

  it("trims text and drops blank bullets, skills and links", () => {
    const values = toFormValues(draft());
    values.experience[0]?.bullets.push({ value: "   " });
    values.skills.push({ value: "" }, { value: "  Go  " });
    values.contact.links.push({ value: " " });

    const result = toDraft(values);

    expect(result.experience[0]?.bullets).toEqual(["Built APIs", "Led a team"]);
    expect(result.skills).toEqual(["Node.js", "SQL", "Go"]);
    expect(result.contact.links).toEqual(["github.com/ada"]);
  });

  it("keeps entry ids so clarification questions still point at their entries", () => {
    expect(toDraft(toFormValues(draft())).experience[0]?.id).toBe("exp-1");
    expect(toDraft(toFormValues(draft())).education[0]?.id).toBe("edu-1");
  });

  it("gives new entries a fresh unique id", () => {
    const first = newExperienceEntry();
    const second = newExperienceEntry();

    expect(first.id).not.toBe(second.id);
    expect(first.id.length).toBeGreaterThan(0);
    expect(newEducationEntry().id).not.toBe(newEducationEntry().id);
    expect(first.bullets).toEqual([]);
  });
});

describe("cvFormSchema", () => {
  it("accepts a valid form", () => {
    expect(cvFormSchema.safeParse(toFormValues(draft())).success).toBe(true);
  });

  function messages(change: (values: ReturnType<typeof toFormValues>) => void): string[] {
    const values = toFormValues(draft());
    change(values);
    const result = cvFormSchema.safeParse(values);
    return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }

  it("rejects a malformed email with a message on the field", () => {
    expect(messages((values) => { values.contact.email = "nope"; })).toContain("contact.email: Enter a valid email address.");
  });

  it("rejects text over the caps the server enforces", () => {
    expect(messages((values) => { values.contact.fullName = "x".repeat(121); }).join()).toContain("contact.fullName");
    expect(messages((values) => { values.summary = "x".repeat(1201); }).join()).toContain("summary");
    expect(messages((values) => { values.skills[0] = { value: "x".repeat(61) }; }).join()).toContain("skills.0.value");
    expect(messages((values) => { values.experience[0]?.bullets.push({ value: "x".repeat(301) }); }).join()).toContain("experience.0.bullets.2.value");
  });

  it("rejects too many items", () => {
    expect(messages((values) => { values.skills = Array.from({ length: 61 }, (_, index) => ({ value: `s${index}` })); }).join()).toContain("skills");
    expect(messages((values) => { values.experience[0]?.bullets.push(...Array.from({ length: 11 }, () => ({ value: "b" }))); }).join()).toContain("experience.0.bullets");
    expect(messages((values) => { values.contact.links = Array.from({ length: 6 }, () => ({ value: "l" })); }).join()).toContain("contact.links");
  });

  it("requires an experience entry to have an employer or a title", () => {
    const result = messages((values) => {
      const entry = values.experience[0];
      if (entry) {
        entry.employer = "";
        entry.title = "";
      }
    });

    expect(result.join()).toContain("experience.0.employer");
  });

  it("requires an education entry to have an institution or a qualification", () => {
    const result = messages((values) => {
      const entry = values.education[0];
      if (entry) {
        entry.institution = "";
        entry.qualification = "";
      }
    });

    expect(result.join()).toContain("education.0.institution");
  });
});
