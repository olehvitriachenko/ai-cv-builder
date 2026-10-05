import { describe, expect, it } from "vitest";
import {
  MAX_PDF_BYTES,
  createCvFormSchema,
  validatePdfFile,
  type CreateCvFormValues,
} from "./create-form";

const TEXT = "Ten years as a backend engineer building REST APIs in Node.js and PostgreSQL.";

function pdf(name = "cv.pdf", size = 1000, type = "application/pdf"): File {
  return new File([new Uint8Array(size)], name, { type });
}

function values(overrides: Partial<CreateCvFormValues>): CreateCvFormValues {
  return { mode: "text", targetRole: "Backend Engineer", sourceText: TEXT, file: null, ...overrides };
}

function fieldsWithErrors(input: CreateCvFormValues): string[] {
  const result = createCvFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => String(issue.path[0]));
}

describe("createCvFormSchema: free text", () => {
  it("accepts a role and enough text", () => {
    expect(createCvFormSchema.safeParse(values({})).success).toBe(true);
  });

  it("requires the target role (trimmed, at most 200 characters)", () => {
    expect(fieldsWithErrors(values({ targetRole: "   " }))).toEqual(["targetRole"]);
    expect(fieldsWithErrors(values({ targetRole: "a".repeat(201) }))).toEqual(["targetRole"]);
    expect(fieldsWithErrors(values({ targetRole: "a".repeat(200) }))).toEqual([]);
  });

  it("measures the text after trimming: 50 to 20,000 characters", () => {
    expect(fieldsWithErrors(values({ sourceText: "too short" }))).toEqual(["sourceText"]);
    expect(fieldsWithErrors(values({ sourceText: ` ${"a".repeat(49)} ` }))).toEqual(["sourceText"]);
    expect(fieldsWithErrors(values({ sourceText: "a".repeat(50) }))).toEqual([]);
    expect(fieldsWithErrors(values({ sourceText: "a".repeat(20_001) }))).toEqual(["sourceText"]);
  });

  it("ignores a leftover file in text mode, so only one source is ever used", () => {
    expect(fieldsWithErrors(values({ file: pdf("notes.docx", 10, "application/msword") }))).toEqual([]);
  });
});

describe("createCvFormSchema: PDF", () => {
  const pdfMode = (overrides: Partial<CreateCvFormValues>) =>
    values({ mode: "pdf", sourceText: "", file: pdf(), ...overrides });

  it("accepts a role and a PDF, whatever is left in the text box", () => {
    expect(fieldsWithErrors(pdfMode({}))).toEqual([]);
    expect(fieldsWithErrors(pdfMode({ sourceText: "leftover" }))).toEqual([]);
  });

  it("requires a file", () => {
    expect(fieldsWithErrors(pdfMode({ file: null }))).toEqual(["file"]);
  });

  it("rejects a file that is not a PDF, and one over 5 MB", () => {
    expect(fieldsWithErrors(pdfMode({ file: pdf("cv.docx", 10, "application/vnd.ms-word") }))).toEqual(["file"]);
    expect(fieldsWithErrors(pdfMode({ file: pdf("cv.pdf", MAX_PDF_BYTES + 1) }))).toEqual(["file"]);
    expect(fieldsWithErrors(pdfMode({ file: pdf("cv.pdf", MAX_PDF_BYTES) }))).toEqual([]);
  });

  it("still requires the target role", () => {
    expect(fieldsWithErrors(pdfMode({ targetRole: "" }))).toEqual(["targetRole"]);
  });
});

describe("validatePdfFile", () => {
  it("accepts by declared type or by .pdf extension (hint only; the server checks the content)", () => {
    expect(validatePdfFile(pdf("cv", 10, "application/pdf"))).toBeNull();
    expect(validatePdfFile(pdf("CV.PDF", 10, ""))).toBeNull();
  });

  it("explains each problem in plain language", () => {
    expect(validatePdfFile(null)).toMatch(/choose a pdf/i);
    expect(validatePdfFile(pdf("cv.docx", 10, "text/plain"))).toMatch(/only pdf/i);
    expect(validatePdfFile(pdf("cv.pdf", MAX_PDF_BYTES + 1))).toMatch(/5 MB/);
  });
});
