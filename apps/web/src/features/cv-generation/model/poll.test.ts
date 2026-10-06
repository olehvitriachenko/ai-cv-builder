import { describe, expect, it } from "vitest";
import { POLL_INTERVAL_MS, pollInterval } from "./poll";

describe("pollInterval", () => {
  it("polls about every 2 seconds while the generation is waiting or processing", () => {
    expect(POLL_INTERVAL_MS).toBe(2000);
    expect(pollInterval("PENDING")).toBe(2000);
    expect(pollInterval("PROCESSING")).toBe(2000);
  });

  it("stops on a terminal state", () => {
    expect(pollInterval("COMPLETED")).toBe(false);
    expect(pollInterval("FAILED")).toBe(false);
  });

  it("does not poll when there is no status yet", () => {
    expect(pollInterval(undefined)).toBe(false);
  });
});
