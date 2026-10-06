import { describe, expect, it, vi } from "vitest";
import type { CvResult } from "@/entities/cv/schemas";
import { ApiError } from "@/shared/api/fetcher";
import type { SaveState } from "./autosave";
import { APPLY_ACTION_LABELS, ApplyBlockedError, applyAnswer, applyErrorOutcome } from "./apply-flow";

const RESULT: CvResult = {
  id: "cv1",
  status: "COMPLETED",
  revision: 4,
  targetRole: "Backend Engineer",
  draft: {
    schemaVersion: 2,
    contact: { fullName: null, email: null, phone: null, location: null, links: [] },
    summary: null,
    experience: [],
    education: [],
    skillCategories: [],
  },
  questions: [],
};

function state(overrides: Partial<SaveState>): SaveState {
  return { status: "saved", revision: 3, failure: null, ...overrides };
}

describe("applyAnswer", () => {
  it("saves pending edits first, then applies on the revision the save produced", async () => {
    const order: string[] = [];
    const flush = vi.fn(async () => {
      order.push("flush");
      return state({ revision: 7 });
    });
    const apply = vi.fn(async (revision: number) => {
      order.push(`apply@${revision}`);
      return RESULT;
    });

    const result = await applyAnswer({ flush, apply, blockedReason: null });

    expect(order).toEqual(["flush", "apply@7"]);
    expect(result).toBe(RESULT);
  });

  it("does not apply while the form has errors", async () => {
    const flush = vi.fn();
    const apply = vi.fn();

    await expect(applyAnswer({ flush, apply, blockedReason: "Fix the highlighted fields first." })).rejects.toThrow(ApplyBlockedError);
    expect(flush).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it.each([
    [state({ status: "error", failure: "other" }), "couldn’t be saved"],
    [state({ status: "conflict", failure: "conflict" }), "changed somewhere else"],
    [state({ status: "conflict", failure: "gone" }), "can’t be edited"],
  ])("does not apply when the last save did not succeed (%j)", async (final, text) => {
    const apply = vi.fn();

    const error = await applyAnswer({ flush: async () => final, apply, blockedReason: null }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApplyBlockedError);
    expect(error instanceof Error ? error.message : "").toContain(text);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("applyErrorOutcome", () => {
  const outcome = (status: number, code: string, target: string | null = null) =>
    applyErrorOutcome(new ApiError(status, code, "server text"), target);

  it("a stale target names the section and offers Review section and Dismiss", () => {
    const result = outcome(409, "TARGET_NOT_APPLICABLE", "Kilona");

    expect(result).toMatchObject({ kind: "target_stale", reload: false, actions: ["review_section", "dismiss"] });
    expect(result.message).toBe(
      "The Kilona section changed since this question was created. Review the current section before deciding.",
    );
  });

  it("a revision conflict does not reload on its own: the person reviews the latest version first", () => {
    const result = outcome(409, "REVISION_CONFLICT");

    expect(result).toMatchObject({ kind: "revision_conflict", reload: false, actions: ["review_latest", "retry_after_review"] });
    expect(result.message).toContain("newer saved CV revision");
  });

  it("a question that changed elsewhere reloads the latest version", () => {
    expect(outcome(409, "QUESTION_STATE_CONFLICT")).toMatchObject({ kind: "question_changed", reload: true });
  });

  it("an AI outage keeps the answer and offers Retry later and Edit manually", () => {
    const result = outcome(503, "AI_UNAVAILABLE");

    expect(result).toMatchObject({ kind: "ai_unavailable", actions: ["retry_later", "edit_manually"] });
    expect(result.message).toBe("The AI service is unavailable. Your answer and CV draft are retained.");
  });

  it("unusable AI output says nothing unconfirmed was applied and offers Re-answer and Edit manually", () => {
    const result = outcome(422, "APPLY_OUTPUT_INVALID");

    expect(result).toMatchObject({ kind: "output_invalid", actions: ["re_answer", "edit_manually"] });
    expect(result.message).toBe("The output could not be validated. No unconfirmed wording was applied.");
  });

  it("explains a field that cannot hold the answer and offers Re-answer or Dismiss", () => {
    const result = outcome(422, "ANSWER_INVALID_FOR_FIELD");

    expect(result).toMatchObject({ kind: "answer_invalid", reload: false, actions: ["re_answer", "dismiss"] });
    expect(result.message).toContain("answer");
  });

  it("offers a way to retry only for the causes the person can act on", () => {
    expect(outcome(409, "CV_NOT_EDITABLE").actions).toEqual([]);
    expect(outcome(404, "QUESTION_NOT_FOUND")).toMatchObject({ kind: "gone", reload: true, actions: [] });
  });

  it("keeps the CV and the answer in every other failure, without echoing server text", () => {
    const result = applyErrorOutcome(new Error("boom with secret"));

    expect(result.message).toMatch(/nothing was changed/i);
    expect(result.message).not.toContain("secret");
    expect(applyErrorOutcome(new ApiError(404, "QUESTION_NOT_FOUND", "x")).message).toMatch(/no longer exists/i);
  });

  it("labels every action", () => {
    expect(Object.keys(APPLY_ACTION_LABELS).sort()).toEqual(
      ["dismiss", "edit_manually", "re_answer", "retry_after_review", "retry_later", "review_latest", "review_section"],
    );
  });
});
