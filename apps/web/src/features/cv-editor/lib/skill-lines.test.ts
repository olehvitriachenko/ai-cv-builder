import { describe, expect, it } from "vitest";
import { skillLines } from "./skill-lines";

describe("skillLines", () => {
  it("labels each category that holds skills", () => {
    expect(
      skillLines([
        { id: "a", name: "Languages", skills: ["TypeScript", "Go"] },
        { id: "b", name: "Databases", skills: ["PostgreSQL"] },
      ]),
    ).toEqual([
      { label: "Languages", skills: ["TypeScript", "Go"] },
      { label: "Databases", skills: ["PostgreSQL"] },
    ]);
  });

  it("leaves a lone default Skills category without a label (the section heading says it)", () => {
    expect(skillLines([{ id: "skills-default", name: "Skills", skills: ["Node.js"] }])).toEqual([
      { label: null, skills: ["Node.js"] },
    ]);
    expect(skillLines([{ id: "x", name: "skills", skills: ["Node.js"] }])).toEqual([{ label: null, skills: ["Node.js"] }]);
  });

  it("keeps the label of a Skills category once it is not the only one", () => {
    expect(
      skillLines([
        { id: "a", name: "Languages", skills: ["Go"] },
        { id: "b", name: "Skills", skills: ["Mentoring"] },
      ]),
    ).toEqual([
      { label: "Languages", skills: ["Go"] },
      { label: "Skills", skills: ["Mentoring"] },
    ]);
  });

  it("skips categories without skills, so an all-empty list has no lines", () => {
    expect(skillLines([{ id: "a", name: "Languages", skills: [] }])).toEqual([]);
    expect(skillLines([])).toEqual([]);
  });
});
