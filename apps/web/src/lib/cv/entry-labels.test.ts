import { describe, expect, it } from "vitest";
import { educationCount, educationHeading, experienceCount, experienceHeading, studyLine } from "./entry-labels";

describe("experienceHeading", () => {
  it("reads Company · dates, as in the design", () => {
    expect(experienceHeading({ employer: "Kilona", title: "Dev", startDate: "Jun 2025", endDate: "Present" })).toBe(
      "Kilona · Jun 2025 – Present",
    );
  });

  it("falls back to the title when there is no company, and to a neutral name for an empty entry", () => {
    expect(experienceHeading({ employer: "", title: "Engineer", startDate: "", endDate: "" })).toBe("Engineer");
    expect(experienceHeading({ employer: "  ", title: " ", startDate: "", endDate: "" })).toBe("New experience");
  });

  it("shows whichever of the two dates exists", () => {
    expect(experienceHeading({ employer: "Acme", title: "", startDate: "2016", endDate: "" })).toBe("Acme · 2016");
    expect(experienceHeading({ employer: "Acme", title: "", startDate: "", endDate: "2020" })).toBe("Acme · 2020");
  });
});

describe("educationHeading", () => {
  it("names the entry by its institution, then its degree, then a neutral name", () => {
    expect(educationHeading({ institution: "State University", qualification: "BSc" })).toBe("State University");
    expect(educationHeading({ institution: "", qualification: "BSc" })).toBe("BSc");
    expect(educationHeading({ institution: " ", qualification: "" })).toBe("New education");
  });
});

describe("section count lines", () => {
  it("counts experiences and says where the highlights appear", () => {
    expect(experienceCount(0)).toBe("No experience added");
    expect(experienceCount(1)).toBe("1 experience · Highlights appear in the order below");
    expect(experienceCount(3)).toBe("3 experiences · Highlights appear in the order below");
  });

  it("counts education entries and says when one is ongoing", () => {
    expect(educationCount([])).toBe("No education added");
    expect(educationCount([{ endDate: "2015" }], 2026)).toBe("1 education");
    expect(educationCount([{ endDate: "Present" }], 2026)).toBe("1 education · Ongoing");
    expect(educationCount([{ endDate: "2015" }, { endDate: "2029" }], 2026)).toBe("2 educations · Ongoing");
  });
});

describe("studyLine", () => {
  it("states the ongoing study and the expected completion when there is one", () => {
    expect(studyLine("Present")).toBe("Currently studying");
    expect(studyLine("2029")).toBe("Currently studying · Expected completion in 2029");
  });
});
