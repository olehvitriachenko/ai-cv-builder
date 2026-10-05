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

const ROLE = "Backend Engineer";
const formOf = () => toFormValues(draft(), ROLE);

describe("toFormValues / toDraft", () => {
  it("round-trips a draft unchanged", () => {
    expect(toDraft(formOf())).toEqual(draft());
  });

  it("shows null as an empty input", () => {
    const values = formOf();

    expect(values.contact.phone).toBe("");
    expect(values.experience[0]?.location).toBe("");
    expect(values.summary).toBe("Backend engineer.");
  });

  it("sends an emptied or whitespace-only field as null", () => {
    const values = formOf();
    values.summary = "   ";
    values.contact.email = "";

    const result = toDraft(values);

    expect(result.summary).toBeNull();
    expect(result.contact.email).toBeNull();
  });

  it("trims text and drops blank bullets, skills and links", () => {
    const values = formOf();
    values.experience[0]?.bullets.push({ value: "   " });
    values.skillCategories[0]?.skills.push({ value: "" }, { value: "  Go  " });
    values.contact.extraLinks.push({ value: " " });

    const result = toDraft(values);

    expect(result.experience[0]?.bullets).toEqual(["Built APIs", "Led a team"]);
    expect(result.skillCategories[0]?.skills).toEqual(["Node.js", "SQL", "Go"]);
    expect(result.contact.links).toEqual(["github.com/ada"]);
  });

  it("keeps entry ids so clarification questions still point at their entries", () => {
    expect(toDraft(formOf()).experience[0]?.id).toBe("exp-1");
    expect(toDraft(formOf()).education[0]?.id).toBe("edu-1");
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
    expect(cvFormSchema.safeParse(formOf()).success).toBe(true);
  });

  function messages(change: (values: ReturnType<typeof toFormValues>) => void): string[] {
    const values = formOf();
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
    const values = formOf();
    change(values);
    const result = cvFormSchema.safeParse(values);
    return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }

  it("drops a category that has no skills (the server never stores an empty category)", () => {
    const values = formOf();
    values.skillCategories.push({ id: "cat-2", name: "Databases", skills: [{ value: "  " }] });
    values.skillCategories.push({ id: "cat-3", name: "", skills: [] });

    expect(toDraft(values).skillCategories).toEqual([{ id: "cat-1", name: "Backend", skills: ["Node.js", "SQL"] }]);
  });

  it("trims the category name and keeps the category id", () => {
    const values = formOf();
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
  it("maps the role to and from the form, trimmed and never null", () => {
    const values = formOf();
    expect(values.targetRole).toBe(ROLE);

    values.targetRole = "  Staff Engineer  ";

    expect(toTargetRole(values)).toBe("Staff Engineer");
  });

  it("leaves the stored draft untouched: the role is not part of it", () => {
    const values = formOf();
    values.targetRole = "Something else";

    expect(toDraft(values)).toEqual(draft());
  });

  it("refuses a blank role and one over 200 characters, with a message on the field", () => {
    const blank = formOf();
    blank.targetRole = "   ";
    const long = formOf();
    long.targetRole = "x".repeat(201);

    const messageOf = (values: ReturnType<typeof formOf>) => {
      const result = cvFormSchema.safeParse(values);
      return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    };

    expect(messageOf(blank)).toContain("targetRole: Enter your target role.");
    expect(messageOf(long).join()).toContain("targetRole: Target role must be at most 200 characters.");
  });
});

describe("end dates and education status", () => {
  it("treats Present as an end date choice, ignoring case and spaces", () => {
    expect(PRESENT).toBe("Present");
    expect(isPresent("Present")).toBe(true);
    expect(isPresent("  present ")).toBe(true);
    expect(isPresent("PRESENT")).toBe(true);
    expect(isPresent("2024")).toBe(false);
    expect(isPresent("")).toBe(false);
    expect(isPresent("Presently")).toBe(false);
  });

  it("derives Currently studying from Present or an end year in the future", () => {
    expect(isCurrentlyStudying("Present", 2026)).toBe(true);
    expect(isCurrentlyStudying("2029", 2026)).toBe(true);
    expect(isCurrentlyStudying("May 2029", 2026)).toBe(true);
    expect(isCurrentlyStudying("2026", 2026)).toBe(false);
    expect(isCurrentlyStudying("2015", 2026)).toBe(false);
    expect(isCurrentlyStudying("", 2026)).toBe(false);
    expect(isCurrentlyStudying("not a year", 2026)).toBe(false);
  });

  it("shows the expected graduation only when there is a real date", () => {
    expect(expectedGraduation("Present")).toBe("");
    expect(expectedGraduation("2029")).toBe("2029");
    expect(expectedGraduation("")).toBe("");
  });
});

describe("new entries in the form", () => {
  it("creates empty entries with unique client ids", () => {
    const education = newEducationEntry();

    expect(education).toMatchObject({ institution: "", qualification: "", startDate: "", endDate: "", details: "" });
    expect(newEducationEntry().id).not.toBe(education.id);
    expect(newExperienceEntry()).toMatchObject({ employer: "", title: "", startDate: "", endDate: "", bullets: [] });
  });

  it("blocks the save for a fresh empty entry and says what is missing instead of saving it", () => {
    const withExperience = formOf();
    withExperience.experience.push(newExperienceEntry());
    const withEducation = formOf();
    withEducation.education.push(newEducationEntry());

    const issues = (values: ReturnType<typeof formOf>) => {
      const result = cvFormSchema.safeParse(values);
      return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    };

    expect(issues(withExperience)).toContain("experience.1.employer: Add an employer or a job title.");
    expect(issues(withEducation)).toContain("education.1.institution: Add an institution or a qualification.");
  });

  it("removing entries and highlights is reflected in the saved draft at once", () => {
    const values = formOf();
    values.experience.splice(0, 1);
    values.education.splice(0, 1);
    values.contact.portfolio = "";

    const result = toDraft(values);

    expect(result.experience).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.contact.links).toEqual([]);

    const withBullets = formOf();
    withBullets.experience[0]?.bullets.splice(0, 1);
    expect(toDraft(withBullets).experience[0]?.bullets).toEqual(["Led a team"]);
  });
});
