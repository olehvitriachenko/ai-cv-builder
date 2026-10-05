import { describe, expect, it } from "vitest";
import { LIST_POLL_INTERVAL_MS, listPollInterval } from "./list-poll";

describe("listPollInterval", () => {
  it("polls about every 5 seconds while a CV is PENDING", () => {
    expect(listPollInterval([{ status: "COMPLETED" }, { status: "PENDING" }])).toBe(LIST_POLL_INTERVAL_MS);
    expect(LIST_POLL_INTERVAL_MS).toBe(5000);
  });

  it("polls while a CV is PROCESSING", () => {
    expect(listPollInterval([{ status: "PROCESSING" }])).toBe(5000);
  });

  it("stops when no listed CV is active", () => {
    expect(listPollInterval([{ status: "COMPLETED" }, { status: "FAILED" }])).toBe(false);
  });

  it("does not poll an empty or not yet loaded list", () => {
    expect(listPollInterval([])).toBe(false);
    expect(listPollInterval(undefined)).toBe(false);
  });
});
