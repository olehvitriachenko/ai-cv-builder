import { describe, expect, it } from "vitest";
import { failureReasonSchema } from "@/lib/api/cvs";
import { failureMessage } from "./failure-copy";

describe("failureMessage", () => {
  it("has a message for every failure reason the API can report", () => {
    for (const reason of failureReasonSchema.options) {
      expect(failureMessage(reason).length).toBeGreaterThan(10);
    }
  });

  it("falls back to the generic message when the reason is missing", () => {
    expect(failureMessage(null)).toBe(failureMessage("UNKNOWN"));
  });

  it("always reassures that nothing was stored and never exposes technical terms", () => {
    for (const reason of failureReasonSchema.options) {
      const message = failureMessage(reason);
      expect(message).toMatch(/nothing was added/i);
      expect(message).not.toMatch(/anthropic|api key|stack|prisma|zod|schema|token|http|\b[45]\d\d\b/i);
    }
  });
});
