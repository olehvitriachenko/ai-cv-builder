import { describe, expect, it } from "vitest";
import type { CvDraft } from "@/lib/api/cvs";
import { diffSections, reviewSummary, versionHeading, type VersionContent } from "./conflict-review";

function version(): VersionContent {
  const draft: CvDraft = {
    schemaVersion: 2,
    contact: { fullName: "Oleh Vitriachenko", email: "oleh@example.com", phone: null, location: "Kyiv, Ukraine", links: [] },
    summary: "Full stack developer.",
    experience: [
      {
        id: "e1",
        employer: "Kilona",
        title: "Senior Full Stack Developer",
        location: null,
        startDate: "Jun 2025",
        endDate: "Present",
        bullets: ["Built an AI-powered fitness assistant", "Improved application performance"],
      },
    ],
    education: [
      { id: "d1", institution: "State University", qualification: "Software Engineering", startDate: "2025", endDate: "2029", details: null },
    ],
    skillCategories: [
      { id: "c1", name: "Programming Languages", skills: ["TypeScript"] },
      { id: "c2", name: "Frameworks", skills: ["React", "NestJS"] },
    ],
  };
  return { targetRole: "Senior Full Stack Developer", draft };
}

const copy = (value: VersionContent): VersionContent => structuredClone(value);
const changed = (sections: ReturnType<typeof diffSections>) => sections.filter((section) => section.changed).map((section) => section.title);

describe("diffSections", () => {
  it("reports no difference between identical versions, section by section", () => {
    const sections = diffSections(version(), version());

    expect(sections.map((section) => section.title)).toEqual([
      "Personal details",
      "Professional summary",
      "Experience / Kilona",
      "Education / State University",
      "Skills",
    ]);
    expect(changed(sections)).toEqual([]);
    expect(sections[0]?.local.status).toBe("Unchanged in both versions");
  });

  it("ignores differences that are only blank versus empty or surrounding spaces", () => {
    const saved = copy(version());
    saved.draft.summary = "  Full stack developer.  ";
    saved.draft.contact.phone = "";

    expect(changed(diffSections(version(), saved))).toEqual([]);
  });

  it("marks the one section that differs and says what differs on each side", () => {
    const local = copy(version());
    local.draft.experience[0]!.bullets[0] = "Built an AI-powered fitness assistant using Node.js";

    const sections = diffSections(local, version());
    const experience = sections.find((section) => section.title === "Experience / Kilona");

    expect(changed(sections)).toEqual(["Experience / Kilona"]);
    expect(experience?.local.status).toBe("Changed · Highlights");
    expect(experience?.saved.status).toBe("Difference · Highlights");
    expect(experience?.local.lines).toContain("• Built an AI-powered fitness assistant using Node.js");
    expect(experience?.saved.lines).toContain("• Built an AI-powered fitness assistant");
  });

  it("lists every changed field of a section", () => {
    const local = copy(version());
    local.draft.contact.phone = "+380 44 000 0000";
    local.draft.contact.location = "Lviv";
    local.targetRole = "Staff Engineer";

    const personal = diffSections(local, version())[0];

    expect(personal?.changed).toBe(true);
    expect(personal?.local.status).toBe("Changed · Target role, phone and location");
  });

  it("treats a different order of skills or categories as a difference in skills", () => {
    const local = copy(version());
    local.draft.skillCategories.reverse();

    const sections = diffSections(local, version());

    expect(changed(sections)).toEqual(["Skills"]);
    expect(sections.at(-1)?.local.lines).toEqual(["Frameworks: React, NestJS", "Programming Languages: TypeScript"]);
  });

  it("says Unchanged with the number of skills when skills are the same", () => {
    expect(diffSections(version(), version()).at(-1)?.local.status).toBe("Unchanged · 3 selected skills");
  });

  it("shows an entry that exists in only one version", () => {
    const local = copy(version());
    local.draft.education.push({ id: "d2", institution: "Open School", qualification: "Course", startDate: null, endDate: null, details: null });

    const added = diffSections(local, version()).find((section) => section.title === "Education / Open School");

    expect(added?.changed).toBe(true);
    expect(added?.local.status).toBe("Only in your draft");
    expect(added?.saved.status).toBe("Not in the saved version");
    expect(added?.saved.lines).toEqual([]);

    const removed = diffSections(version(), local).find((section) => section.title === "Education / Open School");
    expect(removed?.local.status).toBe("Not in your draft");
    expect(removed?.saved.status).toBe("Only in the saved version");
  });

  it("never produces a merged document: each side keeps its own text", () => {
    const local = copy(version());
    local.draft.summary = "Local summary.";
    const saved = copy(version());
    saved.draft.summary = "Saved summary.";

    const summary = diffSections(local, saved)[1];

    expect(summary?.local.lines).toEqual(["Local summary."]);
    expect(summary?.saved.lines).toEqual(["Saved summary."]);
  });
});

describe("reviewSummary", () => {
  it("names what differs and says everything else is unchanged", () => {
    const local = copy(version());
    local.draft.experience[0]!.title = "Lead";

    expect(reviewSummary(diffSections(local, version()))).toBe(
      "Experience / Kilona differs · All other sections unchanged · Local draft retained",
    );
  });

  it("joins several sections and says nothing about the rest when all of them differ", () => {
    const local = copy(version());
    local.draft.summary = "Other.";
    local.draft.skillCategories = [];

    expect(reviewSummary(diffSections(local, version()))).toBe(
      "Professional summary and Skills differ · All other sections unchanged · Local draft retained",
    );
  });

  it("says the versions have the same content when nothing differs", () => {
    expect(reviewSummary(diffSections(version(), version()))).toBe(
      "Both versions have the same content · Local draft retained",
    );
  });
});

describe("versionHeading", () => {
  it("shows the name and the target role, with a placeholder for a missing name", () => {
    expect(versionHeading(version())).toEqual({ name: "Oleh Vitriachenko", role: "Senior Full Stack Developer" });
    const nameless = copy(version());
    nameless.draft.contact.fullName = null;
    expect(versionHeading(nameless).name).toBe("Name not provided");
  });
});
