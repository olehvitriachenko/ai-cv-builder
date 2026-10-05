import type { QuestionSection } from "@/lib/cv/question-form";

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
export function revealSection(section: QuestionSection): void {
  const element = document.getElementById(SECTION_IDS[section]);
  if (element === null) {
    return;
  }
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  element.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])")?.focus({ preventScroll: true });
}
