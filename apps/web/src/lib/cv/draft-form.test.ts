import { describe, expect, it } from "vitest";
import type { CvDraft } from "@/lib/api/cvs";
import {
  cvFormSchema,
  expectedGraduation,
  isCurrentlyStudying,
  isPresent,
  newEducationEntry,
  newExperienceEntry,
  newSkillCategory,
  PRESENT,
  toDraft,
  toFormValues,
  toTargetRole,
} from "./draft-form";

const ROLE = "Backend Engineer";

function draft(): CvDraft {
  return {
    schemaVersion: 2,
    contact: { fullName: "Ada Lovelace", email: "ada@example.com", phone: null, location: "London", links: ["github.com/ada"] },
    summary: "Backend engineer.",
    experience: [
      { id: "exp-1", employer: "Acme", title: "Engineer", location: null, startDate: "2016", endDate: null, bullets: ["Built APIs", "Led a team"] },
    ],
    education: [
      { id: "edu-1", institution: "State University", qualification: null, startDate: null, endDate: "2015", details: null },
    ],
    skillCategories: [{ id: "cat-1", name: "Backend", skills: ["Node.js", "SQL"] }],
  };
}

describe("toFormValues / toDraft", () => {
  it("round-trips a draft unchanged", () => {
    expect(toDraft(toFormValues(draft(), ROLE))).toEqual(draft());
  });

  it("shows null as an empty input", () => {
    const values = toFormValues(draft(), ROLE);

    expect(values.contact.phone).toBe("");
    expect(values.experience[0]?.location).toBe("");
    expect(values.summary).toBe("Backend engineer.");
  });

  it("sends an emptied or whitespace-only field as null", () => {
    const values = toFormValues(draft(), ROLE);
    values.summary = "   ";
    values.contact.email = "";

    const result = toDraft(values);

    expect(result.summary).toBeNull();
    expect(result.contact.email).toBeNull();
  });

  it("trims text and drops blank bullets, skills and links", () => {
    const values = toFormValues(draft(), ROLE);
    values.experience[0]?.bullets.push({ value: "   " });
    values.skillCategories[0]?.skills.push({ value: "" }, { value: "  Go  " });
    values.contact.extraLinks.push({ value: " " });

    const result = toDraft(values);

    expect(result.experience[0]?.bullets).toEqual(["Built APIs", "Led a team"]);
    expect(result.skillCategories[0]?.skills).toEqual(["Node.js", "SQL", "Go"]);
    expect(result.contact.links).toEqual(["github.com/ada"]);
  });

  it("keeps entry ids so clarification questions still point at their entries", () => {
    expect(toDraft(toFormValues(draft(), ROLE)).experience[0]?.id).toBe("exp-1");
    expect(toDraft(toFormValues(draft(), ROLE)).education[0]?.id).toBe("edu-1");
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
    expect(cvFormSchema.safeParse(toFormValues(draft(), ROLE)).success).toBe(true);
  });

  function messages(change: (values: ReturnType<typeof toFormValues>) => void): string[] {
    const values = toFormValues(draft(), ROLE);
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
    expect(messages((values) => { values.skillCategories[0]!.skills[0] = { value: "x".repeat(61) }; }).join()).toContain("skillCategories.0.skills.0.value");
    expect(messages((values) => { values.skillCategories[0]!.name = "x".repeat(61); }).join()).toContain("skillCategories.0.name");
    expect(messages((values) => { values.experience[0]?.bullets.push({ value: "x".repeat(301) }); }).join()).toContain("experience.0.bullets.2.value");
  });

  it("rejects too many items", () => {
    expect(messages((values) => { values.skillCategories = Array.from({ length: 13 }, (_, index) => ({ id: `c${index}`, name: `C${index}`, skills: [{ value: `s${index}` }] })); }).join()).toContain("skillCategories:");
    expect(messages((values) => { values.experience[0]?.bullets.push(...Array.from({ length: 11 }, () => ({ value: "b" }))); }).join()).toContain("experience.0.bullets");
    expect(messages((values) => { values.contact.extraLinks = Array.from({ length: 6 }, (_, index) => ({ value: `site${index}.dev` })); }).join()).toContain("contact.extraLinks");
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

describe("skill categories in the form", () => {
  function categoryMessages(change: (values: ReturnType<typeof toFormValues>) => void): string[] {
    const values = toFormValues(draft(), ROLE);
    change(values);
    const result = cvFormSchema.safeParse(values);
    return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }

  it("drops a category that has no skills (the server never stores an empty category)", () => {
    const values = toFormValues(draft(), ROLE);
    values.skillCategories.push({ id: "cat-2", name: "Databases", skills: [{ value: "  " }] });
    values.skillCategories.push({ id: "cat-3", name: "", skills: [] });

    expect(toDraft(values).skillCategories).toEqual([{ id: "cat-1", name: "Backend", skills: ["Node.js", "SQL"] }]);
  });

  it("trims the category name and keeps the category id", () => {
    const values = toFormValues(draft(), ROLE);
    values.skillCategories[0]!.name = "  Backend  ";

    expect(toDraft(values).skillCategories[0]).toMatchObject({ id: "cat-1", name: "Backend" });
  });

  it("gives a new category a fresh unique id", () => {
    expect(newSkillCategory().id).not.toBe(newSkillCategory().id);
    expect(newSkillCategory()).toMatchObject({ name: "", skills: [] });
  });

  it("asks for a name when a category holds skills", () => {
    expect(categoryMessages((values) => { values.skillCategories[0]!.name = "  "; })).toContain(
      "skillCategories.0.name: Name this category.",
    );
  });

  it("rejects two categories with the same name, ignoring case", () => {
    const result = categoryMessages((values) => {
      values.skillCategories.push({ id: "cat-2", name: "BACKEND", skills: [{ value: "Go" }] });
    });

    expect(result).toContain("skillCategories.1.name: Another category already uses this name.");
  });

  it("rejects a skill listed twice anywhere in the CV, ignoring case", () => {
    const result = categoryMessages((values) => {
      values.skillCategories.push({ id: "cat-2", name: "Tools", skills: [{ value: "node.js" }] });
    });

    expect(result.join()).toContain("skillCategories.1.skills:");
  });

  it("rejects more than 60 skills in total across categories", () => {
    const result = categoryMessages((values) => {
      values.skillCategories = [
        { id: "a", name: "A", skills: Array.from({ length: 31 }, (_, index) => ({ value: `a${index}` })) },
        { id: "b", name: "B", skills: Array.from({ length: 30 }, (_, index) => ({ value: `b${index}` })) },
      ];
    });

    expect(result).toContain("skillCategories: At most 60 skills in total.");
  });

  it("accepts 12 categories and exactly 60 skills", () => {
    const result = categoryMessages((values) => {
      values.skillCategories = Array.from({ length: 12 }, (_, category) => ({
        id: `c${category}`,
        name: `Category ${category}`,
        skills: Array.from({ length: 5 }, (_, skill) => ({ value: `skill-${category}-${skill}` })),
      }));
    });

    expect(result).toEqual([]);
  });
});


describe("target role in the form", () => {
  it("maps the stored role to the form and back, trimmed and never null", () => {
    const values = toFormValues(draft(), "Backend Engineer");
    expect(values.targetRole).toBe("Backend Engineer");

    values.targetRole = "  Staff Engineer  ";
    expect(toTargetRole(values)).toBe("Staff Engineer");
  });

  it("requires a role of at most 200 characters, like the server", () => {
    const values = toFormValues(draft(), ROLE);

    values.targetRole = "   ";
    const blank = cvFormSchema.safeParse(values);
    expect(blank.success ? [] : blank.error.issues.map((issue) => issue.path.join("."))).toContain("targetRole");

    values.targetRole = "x".repeat(201);
    expect(cvFormSchema.safeParse(values).success).toBe(false);

    values.targetRole = "x".repeat(200);
    expect(cvFormSchema.safeParse(values).success).toBe(true);
  });
});

describe("end dates", () => {
  it("treats Present as an end-date mode, ignoring case and spaces", () => {
    expect(PRESENT).toBe("Present");
    for (const value of ["Present", "present", " PRESENT "]) {
      expect(isPresent(value)).toBe(true);
    }
    for (const value of ["", "2023", "Mar 2023", "Presently"]) {
      expect(isPresent(value)).toBe(false);
    }
  });

  it("derives currently studying from Present or an end year in the future", () => {
    const today = new Date("2026-10-05T12:00:00Z");

    expect(isCurrentlyStudying("Present", today)).toBe(true);
    expect(isCurrentlyStudying("2027", today)).toBe(true);
    expect(isCurrentlyStudying("2026", today)).toBe(false);
    expect(isCurrentlyStudying("2019", today)).toBe(false);
    expect(isCurrentlyStudying("", today)).toBe(false);
    expect(isCurrentlyStudying("Summer 2030", today)).toBe(false);
  });
});

describe("links in the form", () => {
  const stored = (links: string[]): CvDraft => ({ ...draft(), contact: { ...draft().contact, links } });

  it("shows the flat list as LinkedIn, Portfolio and extra links, and saves it back in that order", () => {
    const links = ["https://github.com/ada", "https://www.linkedin.com/in/ada", "https://ada.dev"];

    const values = toFormValues(stored(links), ROLE);

    expect(values.contact).toMatchObject({
      linkedin: "https://www.linkedin.com/in/ada",
      portfolio: "https://github.com/ada",
      extraLinks: [{ value: "https://ada.dev" }],
    });
    expect(toDraft(values).contact.links).toEqual([
      "https://www.linkedin.com/in/ada",
      "https://github.com/ada",
      "https://ada.dev",
    ]);
  });

  it("keeps a link that is not a URL instead of dropping it", () => {
    expect(toDraft(toFormValues(stored(["my site"]), ROLE)).contact.links).toEqual(["my site"]);
  });

  it("asks for a valid URL on the field that holds the problem", () => {
    const issues = (change: (values: ReturnType<typeof toFormValues>) => void): string[] => {
      const values = toFormValues(draft(), ROLE);
      change(values);
      const result = cvFormSchema.safeParse(values);
      return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    };

    expect(issues((values) => { values.contact.linkedin = "https://github.com/ada"; })).toEqual([
      "contact.linkedin: Enter a valid LinkedIn URL.",
    ]);
    expect(issues((values) => { values.contact.portfolio = "not a url"; })).toEqual([
      "contact.portfolio: Enter a valid Portfolio URL.",
    ]);
    expect(issues((values) => { values.contact.extraLinks = [{ value: "javascript:alert(1)" }]; })).toEqual([
      "contact.extraLinks.0.value: Enter a valid URL.",
    ]);
  });
});

describe("entries", () => {
  it("a new education entry starts empty", () => {
    expect(newEducationEntry()).toMatchObject({ institution: "", qualification: "", startDate: "", endDate: "", details: "" });
  });

  it("shows the expected graduation only when there is a real date", () => {
    expect(expectedGraduation("Present")).toBe("");
    expect(expectedGraduation("2029")).toBe("2029");
    expect(expectedGraduation("")).toBe("");
  });

  it("removing entries and highlights is reflected in the saved draft at once", () => {
    const values = toFormValues(draft(), ROLE);
    values.experience.splice(0, 1);
    values.education.splice(0, 1);
    values.contact.portfolio = "";

    const result = toDraft(values);

    expect(result.experience).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.contact.links).toEqual([]);

    const withBullets = toFormValues(draft(), ROLE);
    withBullets.experience[0]?.bullets.splice(0, 1);
    expect(toDraft(withBullets).experience[0]?.bullets).toEqual(["Led a team"]);
  });

  it("an entry that breaks the schema is reported by field, so the editor can block the save", () => {
    const values = toFormValues(draft(), ROLE);
    values.experience.push({ ...newExperienceEntry(), startDate: "2020" });

    const result = cvFormSchema.safeParse(values);

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))).toContain("experience.1.employer");
  });
});
