import { describe, expect, it } from "vitest";
import { expectedPdfFilename } from "./pdf-filename";

describe("expectedPdfFilename", () => {
  it("joins the candidate and the role with dashes", () => {
    expect(expectedPdfFilename("Oleh Vitriachenko", "Senior Full Stack Developer")).toBe(
      "Oleh-Vitriachenko-Senior-Full-Stack-Developer.pdf",
    );
  });

  it("drops path separators, dots, quotes and symbols", () => {
    expect(expectedPdfFilename("../Ada \"Byron\"", "R&D / Lead")).toBe("Ada-Byron-RD-Lead.pdf");
  });

  it("keeps non-Latin letters", () => {
    expect(expectedPdfFilename("Олег Вітрук", "Розробник")).toBe("Олег-Вітрук-Розробник.pdf");
  });

  it("falls back to CV when nothing usable is left, and works without a name", () => {
    expect(expectedPdfFilename(null, "!!!")).toBe("CV.pdf");
    expect(expectedPdfFilename(null, "Engineer")).toBe("Engineer.pdf");
  });

  it("is at most 80 characters before the extension", () => {
    const name = expectedPdfFilename("A".repeat(60), "B".repeat(60));
    expect(name.length).toBe(80 + ".pdf".length);
    expect(name.endsWith("-.pdf")).toBe(false);
  });
});
