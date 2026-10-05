import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/fetcher";
import { canDelete, deleteOutcome, deleteSubject } from "./delete-flow";

describe("canDelete", () => {
  it("allows only finished CVs", () => {
    expect(canDelete({ status: "COMPLETED" })).toBe(true);
    expect(canDelete({ status: "FAILED" })).toBe(true);
    expect(canDelete({ status: "PENDING" })).toBe(false);
    expect(canDelete({ status: "PROCESSING" })).toBe(false);
  });
});

describe("deleteOutcome", () => {
  it("treats a 404 as already deleted: nothing left to do but refresh", () => {
    expect(deleteOutcome(new ApiError(404, "CV_NOT_FOUND", "CV not found"))).toEqual({ kind: "gone" });
  });

  it("explains a 409 as still generating", () => {
    const outcome = deleteOutcome(new ApiError(409, "CV_GENERATION_ACTIVE", "x"));

    expect(outcome.kind).toBe("active");
    expect(outcome.kind === "active" && outcome.message).toContain("still being generated");
  });

  it("keeps the CV and asks to try again for any other failure", () => {
    for (const error of [new ApiError(500, "INTERNAL", "x"), new ApiError(0, "NETWORK", "x"), new Error("boom")]) {
      const outcome = deleteOutcome(error);
      expect(outcome.kind).toBe("failed");
      expect(outcome.kind === "failed" && outcome.message).toContain("try again");
    }
  });
});

describe("deleteSubject", () => {
  it("names the CV like the Figma dialog: candidate · role", () => {
    expect(deleteSubject({ candidateName: "Alex Morgan", targetRole: "Senior Frontend Engineer" })).toBe(
      "Alex Morgan · Senior Frontend Engineer",
    );
  });

  it("uses Untitled CV when there is no candidate name", () => {
    expect(deleteSubject({ candidateName: null, targetRole: "UI Engineer" })).toBe("Untitled CV · UI Engineer");
  });
});
