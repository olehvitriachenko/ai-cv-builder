import { afterEach, describe, expect, it, vi } from "vitest";
import type { MissingItem } from "@/lib/cv/completeness";
import { revealMissingItem, revealSection } from "./section-links";

afterEach(() => vi.unstubAllGlobals());

function setup(selector: string | null, reducedMotion = false) {
  const field = { scrollIntoView: vi.fn(), focus: vi.fn() };
  const section = {
    scrollIntoView: vi.fn(),
    querySelector: vi.fn((query: string) => query === selector ? field : null),
  };
  const getElementById = vi.fn(() => section);
  vi.stubGlobal("document", { getElementById });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reducedMotion }) });
  return { field, section, getElementById };
}

const destinations: [MissingItem["id"], string, string][] = [
  ["fullName", "contact", 'input[name="contact.fullName"]'],
  ["email", "contact", 'input[name="contact.email"]'],
  ["phone", "contact", 'input[name="contact.phone"]'],
  ["location", "contact", 'input[name="contact.location"]'],
  ["linkedin", "contact", 'input[name="contact.linkedin"]'],
  ["summary", "summary", 'textarea[name="summary"]'],
  ["experience", "experience", 'input[name$=".title"]'],
  ["education", "education", 'input[name$=".institution"]'],
  ["skills", "skills", "#skills-input"],
];

describe("completeness navigation", () => {
  it.each(destinations)("scrolls %s to its own field and focuses it", (item, section, selector) => {
    const dom = setup(`${selector}:not(:disabled)`);
    revealMissingItem(item);
    expect(dom.getElementById).toHaveBeenCalledWith(`cv-section-${section}`);
    expect(dom.field.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(dom.field.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("focuses an empty section's available Add control without adding an entry", () => {
    const dom = setup("input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)");
    revealMissingItem("education");
    expect(dom.field.focus).toHaveBeenCalledOnce();
    expect(dom.field.scrollIntoView).toHaveBeenCalledOnce();
  });

  it("uses immediate scrolling when reduced motion is enabled", () => {
    const dom = setup('input[name="contact.phone"]:not(:disabled)', true);
    revealMissingItem("phone");
    expect(dom.field.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("still reveals the section when every control is disabled", () => {
    const dom = setup(null);
    revealMissingItem("skills");
    expect(dom.section.scrollIntoView).toHaveBeenCalledOnce();
    expect(dom.field.focus).not.toHaveBeenCalled();
  });

  it("preserves existing section-level navigation", () => {
    const dom = setup("input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)");
    revealSection("CONTACT");
    expect(dom.section.scrollIntoView).toHaveBeenCalledOnce();
    expect(dom.field.focus).toHaveBeenCalledOnce();
  });
});
