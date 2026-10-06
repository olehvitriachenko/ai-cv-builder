import type { SkillCategory } from "@/lib/api/cvs";
import { FALLBACK_CATEGORY } from "./skill-catalogue";

export interface SkillLine {
  /** `null` for a lone default "Skills" category: the section heading already says it. */
  label: string | null;
  skills: string[];
}

/**
 * What the Skills section shows: one line per category that holds a skill. The PDF
 * (`cv-pdf.document.tsx` in the API) applies the same rule, so preview and export agree.
 */
export function skillLines(categories: readonly SkillCategory[]): SkillLine[] {
  const filled = categories.filter((category) => category.skills.length > 0);
  const [only] = filled;
  const unlabelled =
    filled.length === 1 && only !== undefined && only.name.trim().toLowerCase() === FALLBACK_CATEGORY.toLowerCase();
  return filled.map((category) => ({ label: unlabelled ? null : category.name, skills: category.skills }));
}
