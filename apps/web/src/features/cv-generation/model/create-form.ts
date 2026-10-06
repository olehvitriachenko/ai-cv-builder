import { z } from "zod";

// Mirrors the server limits for fast feedback; the API stays authoritative (it checks the PDF by
// its content, not its name, and enforces the same sizes).
export const MIN_SOURCE_CHARS = 50;
export const MAX_SOURCE_CHARS = 20_000;
import { MAX_TARGET_ROLE_CHARS } from "@/entities/cv/limits";
export { MAX_TARGET_ROLE_CHARS };
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export type SourceMode = "text" | "pdf";

/** A hint only: the file name and declared type are never trusted by the server. */
export function validatePdfFile(file: File | null): string | null {
  if (file === null) {
    return "Choose a PDF to upload.";
  }
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) {
    return "Only PDF files are supported.";
  }
  if (file.size > MAX_PDF_BYTES) {
    return "The PDF must be 5 MB or smaller.";
  }
  return null;
}

/**
 * One flat form with a mode switch. Only the active mode's source is validated and submitted, so
 * the request always carries exactly one source (free text or a PDF), never both.
 */
export const createCvFormSchema = z
  .object({
    mode: z.enum(["text", "pdf"]),
    targetRole: z
      .string()
      .trim()
      .min(1, "Enter the role you’re targeting.")
      .max(MAX_TARGET_ROLE_CHARS, `Keep the role under ${MAX_TARGET_ROLE_CHARS} characters.`),
    sourceText: z.string(),
    file: z.custom<File | null>((value) => value === null || value instanceof File),
  })
  .superRefine((values, ctx) => {
    if (values.mode === "text") {
      const length = values.sourceText.trim().length;
      if (length < MIN_SOURCE_CHARS) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceText"],
          message: `Add at least ${MIN_SOURCE_CHARS} characters about your experience.`,
        });
      } else if (length > MAX_SOURCE_CHARS) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceText"],
          message: `Keep it under ${MAX_SOURCE_CHARS.toLocaleString("en-US")} characters.`,
        });
      }
      return;
    }

    const problem = validatePdfFile(values.file);
    if (problem) {
      ctx.addIssue({ code: "custom", path: ["file"], message: problem });
    }
  });

export type CreateCvFormValues = z.input<typeof createCvFormSchema>;
