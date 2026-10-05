import { describe, expect, it } from "vitest";
import { MAX_LINKS, mergeLinks, splitLinks } from "./links";

describe("splitLinks", () => {
  it("takes the first LinkedIn link as LinkedIn and the first other link as Portfolio", () => {
    expect(splitLinks(["https://github.com/ada", "https://www.linkedin.com/in/ada", "https://ada.dev"])).toEqual({
      linkedin: "https://www.linkedin.com/in/ada",
      portfolio: "https://github.com/ada",
      extra: ["https://ada.dev"],
    });
  });

  it("recognises LinkedIn with or without a scheme, a www prefix or a country subdomain", () => {
    for (const link of ["linkedin.com/in/ada", "http://LinkedIn.com/in/ada", "https://uk.linkedin.com/in/ada"]) {
      expect(splitLinks([link]).linkedin).toBe(link);
    }
  });

  it("does not mistake a look-alike host for LinkedIn", () => {
    const result = splitLinks(["https://notlinkedin.com/ada", "https://example.com/linkedin.com"]);

    expect(result.linkedin).toBeNull();
    expect(result.portfolio).toBe("https://notlinkedin.com/ada");
    expect(result.extra).toEqual(["https://example.com/linkedin.com"]);
  });

  it("puts a second LinkedIn link in the extras, never in Portfolio", () => {
    expect(splitLinks(["linkedin.com/in/a", "linkedin.com/in/b"])).toEqual({
      linkedin: "linkedin.com/in/a",
      portfolio: null,
      extra: ["linkedin.com/in/b"],
    });
  });

  it("returns empty slots for no links and ignores blank entries", () => {
    expect(splitLinks([])).toEqual({ linkedin: null, portfolio: null, extra: [] });
    expect(splitLinks(["  ", ""])).toEqual({ linkedin: null, portfolio: null, extra: [] });
  });
});

describe("mergeLinks", () => {
  it("returns LinkedIn, Portfolio, then the extras, dropping blanks and trimming", () => {
    expect(mergeLinks({ linkedin: " linkedin.com/in/a ", portfolio: "", extra: ["x.dev", "  ", "y.dev"] })).toEqual([
      "linkedin.com/in/a",
      "x.dev",
      "y.dev",
    ]);
  });

  it(`never returns more than ${MAX_LINKS} links`, () => {
    const merged = mergeLinks({
      linkedin: "l",
      portfolio: "p",
      extra: ["1", "2", "3", "4"],
    });

    expect(merged).toEqual(["l", "p", "1", "2", "3"]);
  });

  it("keeps every non-blank link through a split and merge, including unknown hosts", () => {
    const links = ["https://ada.dev", "linkedin.com/in/ada", "mailto:ada@example.com", "https://example.org/a"];

    expect([...mergeLinks(splitLinks(links))].sort()).toEqual([...links].sort());
  });
});
