import { describe, expect, it } from "vitest";
import type { CvListItem } from "@/lib/api/cvs";
import { cardActions, cardMessage, cardName, formatUpdated } from "./card-copy";

function item(overrides: Partial<CvListItem>): CvListItem {
  return {
    id: "cv1",
    targetRole: "Backend Engineer",
    status: "COMPLETED",
    displayStatus: "COMPLETED",
    failureReason: null,
    canRetry: false,
    updatedAt: "2026-10-05T10:42:00.000Z",
    candidateName: "Alex Morgan",
    openQuestionsCount: 0,
    ...overrides,
  };
}

describe("cardMessage", () => {
  it("uses the Figma copy for each display status", () => {
    expect(cardMessage(item({ displayStatus: "PROCESSING", status: "PROCESSING" }))).toBe("Structuring your experience…");
    expect(cardMessage(item({ displayStatus: "FAILED", status: "FAILED", failureReason: "UNKNOWN" }))).toBe(
      "Generation stopped. Your source is safe.",
    );
    expect(cardMessage(item({ displayStatus: "COMPLETED" }))).toBe("Reviewed and ready to share");
  });

  it("counts the open questions of a draft, singular for one", () => {
    expect(cardMessage(item({ displayStatus: "DRAFT", openQuestionsCount: 2 }))).toBe("2 questions to strengthen your CV");
    expect(cardMessage(item({ displayStatus: "DRAFT", openQuestionsCount: 1 }))).toBe("1 question to strengthen your CV");
  });
});

describe("cardName", () => {
  it("falls back to Untitled CV when the server has no candidate name", () => {
    expect(cardName(item({ candidateName: null }))).toBe("Untitled CV");
    expect(cardName(item({ candidateName: "Alex Morgan" }))).toBe("Alex Morgan");
  });
});

describe("cardActions", () => {
  it("offers Open and Delete on Draft and Completed cards", () => {
    for (const displayStatus of ["DRAFT", "COMPLETED"] as const) {
      expect(cardActions(item({ displayStatus }))).toEqual({ primary: "open", delete: "enabled" });
    }
  });

  it("offers only View progress while generating and no enabled Delete", () => {
    for (const status of ["PENDING", "PROCESSING"] as const) {
      expect(cardActions(item({ status, displayStatus: "PROCESSING" }))).toEqual({
        primary: "progress",
        delete: "disabled",
      });
    }
  });

  it("offers Try again on a failed card only when the server says a retry is available", () => {
    const failed = { status: "FAILED", displayStatus: "FAILED", failureReason: "TIMED_OUT" } as const;
    expect(cardActions(item({ ...failed, canRetry: true }))).toEqual({
      primary: "retry",
      delete: "enabled",
    });
    expect(cardActions(item({ ...failed, canRetry: false }))).toEqual({
      primary: "none",
      delete: "enabled",
    });
  });
});

describe("formatUpdated", () => {
  it("renders a short date and time", () => {
    expect(formatUpdated("2026-10-05T10:42:00.000Z", "en-GB", "UTC")).toBe("5 Oct 2026, 10:42");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatUpdated("not a date")).toBe("");
  });
});
