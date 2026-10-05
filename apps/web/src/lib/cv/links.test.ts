import { describe, expect, it } from "vitest";
import { linkError, mergeLinks, splitLinks } from "./links";

describe("splitLinks", () => {
  it("takes the first LinkedIn link, the first other link as the portfolio and keeps the rest", () => {
    expect(
      splitLinks([
        "https://github.com/ada",
        "https://www.linkedin.com/in/ada",
        "https://ada.dev",
        "https://twitter.com/ada",
      ]),
    ).toEqual({
      linkedin: "https://www.linkedin.com/in/ada",
      portfolio: "https://github.com/ada",
      extra: ["https://ada.dev", "https://twitter.com/ada"],
    });
  });

  it("recognises linkedin.com and any subdomain, with or without a scheme", () => {
    expect(splitLinks(["linkedin.com/in/ada"]).linkedin).toBe("linkedin.com/in/ada");
    expect(splitLinks(["https://uk.linkedin.com/in/ada"]).linkedin).toBe("https://uk.linkedin.com/in/ada");
    expect(splitLinks(["https://notlinkedin.com/ada"]).linkedin).toBe("");
    expect(splitLinks(["https://linkedin.com.evil.example/ada"]).linkedin).toBe("");
  });

  it("keeps a second LinkedIn link (as the portfolio), never dropping it", () => {
    expect(splitLinks(["https://linkedin.com/in/a", "https://linkedin.com/in/b"])).toEqual({
      linkedin: "https://linkedin.com/in/a",
      portfolio: "https://linkedin.com/in/b",
      extra: [],
    });
  });

  it("keeps text that is not a URL (it is never lost)", () => {
    expect(splitLinks(["my site", "https://ada.dev"])).toEqual({
      linkedin: "",
      portfolio: "my site",
      extra: ["https://ada.dev"],
    });
  });

  it("handles an empty list", () => {
    expect(splitLinks([])).toEqual({ linkedin: "", portfolio: "", extra: [] });
  });
});

describe("mergeLinks", () => {
  it("returns LinkedIn, Portfolio and the extra links in that order, dropping blanks", () => {
    expect(
      mergeLinks({ linkedin: " https://linkedin.com/in/ada ", portfolio: "", extra: ["", "https://ada.dev", "  "] }),
    ).toEqual(["https://linkedin.com/in/ada", "https://ada.dev"]);
  });

  it("keeps at most five links", () => {
    const links = mergeLinks({
      linkedin: "https://linkedin.com/in/a",
      portfolio: "https://a.dev",
      extra: ["https://1.dev", "https://2.dev", "https://3.dev", "https://4.dev"],
    });

    expect(links).toHaveLength(5);
  });

  it("round-trips every non-blank link, whatever the host", () => {
    const original = ["https://github.com/ada", "https://linkedin.com/in/ada", "my site", "https://ada.dev"];

    const merged = mergeLinks(splitLinks(original));

    expect([...merged].sort()).toEqual([...original].sort());
    expect(merged[0]).toBe("https://linkedin.com/in/ada");
  });
});

describe("linkError", () => {
  it("accepts an empty value (the field is optional)", () => {
    expect(linkError("linkedin", "")).toBeNull();
    expect(linkError("portfolio", "   ")).toBeNull();
  });

  it("accepts URLs with or without a scheme", () => {
    expect(linkError("link", "https://ada.dev/work")).toBeNull();
    expect(linkError("link", "ada.dev")).toBeNull();
    expect(linkError("linkedin", "linkedin.com/in/ada")).toBeNull();
    expect(linkError("linkedin", "https://uk.linkedin.com/in/ada")).toBeNull();
  });

  it("asks for a valid LinkedIn URL when the host is not LinkedIn or the text is not a URL", () => {
    expect(linkError("linkedin", "linkedin")).toBe("Enter a valid LinkedIn URL.");
    expect(linkError("linkedin", "https://github.com/ada")).toBe("Enter a valid LinkedIn URL.");
    expect(linkError("linkedin", "https://linkedin.com.evil.example/ada")).toBe("Enter a valid LinkedIn URL.");
  });

  it("asks for a valid portfolio URL and a valid URL for other links", () => {
    expect(linkError("portfolio", "not a URL")).toBe("Enter a valid Portfolio URL.");
    expect(linkError("link", "not a URL")).toBe("Enter a valid URL.");
    expect(linkError("link", "ftp://ada.dev")).toBe("Enter a valid URL.");
    expect(linkError("link", "javascript:alert(1)")).toBe("Enter a valid URL.");
  });
});
