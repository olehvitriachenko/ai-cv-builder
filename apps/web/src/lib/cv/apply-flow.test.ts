import { describe, expect, it, vi } from "vitest";
import type { CvResult } from "@/lib/api/cvs";
import { ApiError } from "@/lib/api/fetcher";
import type { SaveState } from "./autosave";
import { ApplyBlockedError, applyAnswer, applyErrorOutcome } from "./apply-flow";

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
  const outcome = (status: number, code: string) => applyErrorOutcome(new ApiError(status, code, "server text"));

  it("asks to edit or dismiss when the target can no longer take the answer", () => {
    const result = outcome(409, "TARGET_NOT_APPLICABLE");

    expect(result.reload).toBe(false);
    expect(result.message).toContain("dismiss");
  });

  it("reloads the latest version when the CV or the question changed elsewhere", () => {
    expect(outcome(409, "REVISION_CONFLICT")).toMatchObject({ reload: true });
    expect(outcome(409, "QUESTION_STATE_CONFLICT")).toMatchObject({ reload: true });
    expect(outcome(409, "REVISION_CONFLICT").message).toContain("latest");
  });

  it("explains a field that cannot hold the answer", () => {
    const result = outcome(422, "ANSWER_INVALID_FOR_FIELD");

    expect(result.reload).toBe(false);
    expect(result.message).toContain("answer");
  });

  it("says the AI is unavailable or its output unusable, and that nothing changed", () => {
    expect(outcome(503, "AI_UNAVAILABLE").message).toMatch(/unavailable/i);
    expect(outcome(422, "APPLY_OUTPUT_INVALID").message).toMatch(/nothing was changed/i);
    expect(outcome(503, "AI_UNAVAILABLE").message).toMatch(/nothing was changed/i);
  });

  it("keeps the CV and the answer in every other failure, without echoing server text", () => {
    const result = applyErrorOutcome(new Error("boom with secret"));

    expect(result.message).toMatch(/nothing was changed/i);
    expect(result.message).not.toContain("secret");
    expect(applyErrorOutcome(new ApiError(404, "QUESTION_NOT_FOUND", "x")).message).toMatch(/no longer exists/i);
  });
});
