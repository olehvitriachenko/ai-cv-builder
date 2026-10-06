import { describe, expect, it } from "vitest";
import { certificationLine, contentLines, hobbiesLine, languageText, languagesLine } from "./optional-section-text";

describe("optional section text", () => {
  it("writes a language with its level, or just its name", () => {
    expect(languageText({ id: "1", name: "English", level: "C1" })).toBe("English — C1");
    expect(languageText({ id: "2", name: "German", level: null })).toBe("German");
    expect(
      languagesLine([
        { id: "1", name: "English", level: "C1" },
        { id: "2", name: "German", level: null },
      ]),
    ).toBe("English — C1 · German");
  });

  it("writes the issuer and the date of a certification, whichever is there", () => {
    const base = { id: "c", name: "AWS", issuer: null, date: null, link: null };
    expect(certificationLine({ ...base, issuer: "Amazon", date: "Jun 2024" })).toBe("Amazon · Jun 2024");
    expect(certificationLine({ ...base, date: "2024" })).toBe("2024");
    expect(certificationLine(base)).toBeNull();
  });

  it("joins hobbies with dots", () => {
    expect(hobbiesLine(["Chess", "Climbing"])).toBe("Chess · Climbing");
  });

  it("keeps the line breaks of a custom section and drops blank lines", () => {
    expect(contentLines({ id: "s", title: "T", content: "One\n\n  \nTwo\r\nThree" })).toEqual(["One", "Two", "Three"]);
  });
});
