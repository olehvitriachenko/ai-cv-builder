import { describe, expect, it } from "vitest";
import type { ClarificationQuestion, CvDraft } from "@/lib/api/cvs";
import { answerFormSchema, questionContext, questionView, unresolvedCount } from "./question-form";

function question(overrides: Partial<ClarificationQuestion>): ClarificationQuestion {
  return {
    id: "q1",
    section: "EXPERIENCE",
    itemId: "exp-1",
    missing: "Dates",
    question: "When did you leave?",
    status: "UNANSWERED",
    answer: null,
    ...overrides,
  };
}

const draft: CvDraft = {
  schemaVersion: 2,
  contact: { fullName: "Ada", email: null, phone: null, location: null, links: [] },
  summary: null,
  experience: [{ id: "exp-1", employer: "Northstar Labs", title: "Engineer", location: null, startDate: null, endDate: null, bullets: [] }],
  education: [{ id: "edu-1", institution: null, qualification: "BSc", startDate: null, endDate: null, details: null }],
  skillCategories: [],
};

describe("answerFormSchema", () => {
  it("trims and accepts 1 to 1000 characters", () => {
    expect(answerFormSchema.parse({ answer: "  Code reviews  " })).toEqual({ answer: "Code reviews" });
    expect(answerFormSchema.safeParse({ answer: "x".repeat(1000) }).success).toBe(true);
  });

  it("rejects blank and over-long answers with a message", () => {
    const blank = answerFormSchema.safeParse({ answer: "   " });
    const long = answerFormSchema.safeParse({ answer: "x".repeat(1001) });

    expect(blank.success ? "" : blank.error.issues[0]?.message).toBe("Write an answer first.");
    expect(long.success ? "" : long.error.issues[0]?.message).toBe("Keep the answer under 1000 characters.");
  });
});

describe("questionView", () => {
  it("maps each state to its label and the actions it allows", () => {
    expect(questionView(question({ status: "UNANSWERED" }))).toEqual({ label: "Unanswered", canAnswer: true, canDismiss: true, canApply: false, resolved: false });
    expect(questionView(question({ status: "ANSWERED", answer: "a" }))).toEqual({ label: "Answered", canAnswer: true, canDismiss: true, canApply: true, resolved: false });
    expect(questionView(question({ status: "APPLIED", answer: "a" }))).toEqual({ label: "Applied", canAnswer: false, canDismiss: false, canApply: false, resolved: true });
    expect(questionView(question({ status: "DISMISSED" }))).toEqual({ label: "Dismissed", canAnswer: false, canDismiss: false, canApply: false, resolved: true });
  });
});

describe("unresolvedCount", () => {
  it("counts unanswered and answered questions only", () => {
    const all = (["UNANSWERED", "ANSWERED", "APPLIED", "DISMISSED"] as const).map((status, index) => question({ id: `q${index}`, status }));

    expect(unresolvedCount(all)).toBe(2);
    expect(unresolvedCount([])).toBe(0);
  });
});

describe("questionContext", () => {
  it("names the section, and the entry when the question concerns one", () => {
    expect(questionContext(question({ section: "CONTACT", itemId: null }), draft)).toBe("Contact");
    expect(questionContext(question({}), draft)).toBe("Experience · Northstar Labs");
    expect(questionContext(question({ section: "EDUCATION", itemId: "edu-1" }), draft)).toBe("Education · BSc");
  });

  it("falls back to the section when the entry was removed", () => {
    expect(questionContext(question({ itemId: "gone" }), draft)).toBe("Experience");
  });
});
