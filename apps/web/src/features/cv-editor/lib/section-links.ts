import type { MissingItem } from "@/features/cv-editor/model/completeness";
import type { QuestionSection } from "@/features/cv-editor/model/question-form";

// The AI assistant's "Review section" and "Edit manually" actions take the person to the part of
// the CV a question is about. The anchors are the ids of the editor's section cards.

const SECTION_IDS: Record<QuestionSection, string> = {
  CONTACT: "cv-section-contact",
  SUMMARY: "cv-section-summary",
  EXPERIENCE: "cv-section-experience",
  EDUCATION: "cv-section-education",
  SKILLS: "cv-section-skills",
};

/** Scrolls the section into view and moves focus to its first control (the person edits it by hand). */
export function revealSection(section: QuestionSection, selector?: string): void {
  const element = document.getElementById(SECTION_IDS[section]);
  if (element === null) {
    return;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const control = (selector ? element.querySelector<HTMLElement>(`${selector}:not(:disabled)`) : null)
    ?? element.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)");
  const anchor = selector ? (control ?? element) : element;
  anchor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  control?.focus({ preventScroll: true });
}


const COMPLETENESS_TARGETS: Record<MissingItem["id"], { section: QuestionSection; selector: string }> = {
  fullName: { section: "CONTACT", selector: 'input[name="contact.fullName"]' },
  email: { section: "CONTACT", selector: 'input[name="contact.email"]' },
  phone: { section: "CONTACT", selector: 'input[name="contact.phone"]' },
  location: { section: "CONTACT", selector: 'input[name="contact.location"]' },
  linkedin: { section: "CONTACT", selector: 'input[name="contact.linkedin"]' },
  summary: { section: "SUMMARY", selector: 'textarea[name="summary"]' },
  experience: { section: "EXPERIENCE", selector: 'input[name$=".title"]' },
  education: { section: "EDUCATION", selector: 'input[name$=".institution"]' },
  skills: { section: "SKILLS", selector: '#skills-input' },
};

/** Empty sections focus their Add/category control rather than creating data automatically. */
export function revealMissingItem(id: MissingItem["id"]): void {
  const target = COMPLETENESS_TARGETS[id];
  revealSection(target.section, target.selector);
}
