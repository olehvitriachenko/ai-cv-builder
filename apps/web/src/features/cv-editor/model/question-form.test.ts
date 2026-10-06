import { describe, expect, it } from "vitest";
import type { ClarificationQuestion, CvDraft } from "@/entities/cv/schemas";
import {
  answerFormSchema,
  answerHelper,
  answerNeedsSaving,
  answerSaveLabel,
  assistantSummary,
  canApplyAnswer,
  questionContext,
  questionView,
  unresolvedCount,
} from "./question-form";

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
  languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [],
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
    expect(questionContext(question({}), draft)).toBe("Experience / Northstar Labs");
    expect(questionContext(question({ section: "EDUCATION", itemId: "edu-1" }), draft)).toBe("Education / BSc");
  });

  it("falls back to the section when the entry was removed", () => {
    expect(questionContext(question({ itemId: "gone" }), draft)).toBe("Experience");
  });
});

describe("assistantSummary", () => {
  it("counts answered questions that are not applied or dismissed as unresolved", () => {
    expect(assistantSummary([{ status: "UNANSWERED" }, { status: "ANSWERED" }, { status: "APPLIED" }])).toEqual({
      count: "2 unresolved",
      line: "Clarify missing facts and improve your CV",
    });
  });

  it("says All resolved once every question is applied or dismissed, and says nothing special with no questions", () => {
    expect(assistantSummary([{ status: "APPLIED" }, { status: "DISMISSED" }])).toEqual({
      count: "0 unresolved",
      line: "All resolved",
    });
    expect(assistantSummary([]).line).toBe("Clarify missing facts and improve your CV");
  });
});

describe("answerSaveLabel", () => {
  it("labels each save state of the answer, apart from applying it", () => {
    expect(answerSaveLabel("idle")).toBeNull();
    expect(answerSaveLabel("saving")).toBe("Saving…");
    expect(answerSaveLabel("saved")).toBe("Saved");
    expect(answerSaveLabel("error")).toBe("Answer retained in draft");
  });
});

describe("canApplyAnswer", () => {
  const ready = {
    status: "ANSWERED" as const,
    text: "Node.js and PostgreSQL",
    serverAnswer: "Node.js and PostgreSQL",
    save: "saved" as const,
    applying: false,
    otherApplyRunning: false,
  };

  it("allows Apply to CV for an answered question whose text is the one saved", () => {
    expect(canApplyAnswer(ready)).toBe(true);
    expect(canApplyAnswer({ ...ready, text: "  Node.js and PostgreSQL  " })).toBe(true);
  });

  it("does not allow it while the answer is unanswered, changed, saving or failed to save", () => {
    expect(canApplyAnswer({ ...ready, status: "UNANSWERED" })).toBe(false);
    expect(canApplyAnswer({ ...ready, text: "Node.js" })).toBe(false);
    expect(canApplyAnswer({ ...ready, save: "saving" })).toBe(false);
    expect(canApplyAnswer({ ...ready, save: "error" })).toBe(false);
    expect(canApplyAnswer({ ...ready, text: "   " })).toBe(false);
  });

  it("does not allow it while any apply is running", () => {
    expect(canApplyAnswer({ ...ready, applying: true })).toBe(false);
    expect(canApplyAnswer({ ...ready, otherApplyRunning: true })).toBe(false);
  });
});

describe("answerNeedsSaving and answerHelper", () => {
  it("saves a non-blank answer that differs from the stored one", () => {
    expect(answerNeedsSaving("Go", null)).toBe(true);
    expect(answerNeedsSaving(" Go ", "Go")).toBe(false);
    expect(answerNeedsSaving("   ", "Go")).toBe(false);
  });

  it("explains that saving is not applying", () => {
    expect(answerHelper("UNANSWERED")).toBe("Answer autosaves separately. AI never fills in missing facts.");
    expect(answerHelper("ANSWERED")).toBe("Answer saved separately. Your CV stays unchanged until you apply it.");
  });
});
