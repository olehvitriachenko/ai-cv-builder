import { afterEach, describe, expect, it, vi } from "vitest";
import { expireActionFeedback } from "./action-feedback";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("success feedback TTL", () => {
  function timers() {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  }

  it("keeps feedback visible for four seconds, then expires once", () => {
    timers();
    const expire = vi.fn();
    expireActionFeedback(expire);
    vi.advanceTimersByTime(3_999);
    expect(expire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expire).toHaveBeenCalledOnce();
  });

  it("cancels old feedback on unmount or Strict Mode cleanup", () => {
    timers();
    const oldExpiry = vi.fn();
    const cancel = expireActionFeedback(oldExpiry);
    cancel();
    const currentExpiry = vi.fn();
    expireActionFeedback(currentExpiry);
    vi.advanceTimersByTime(4_000);
    expect(oldExpiry).not.toHaveBeenCalled();
    expect(currentExpiry).toHaveBeenCalledOnce();
  });
});
