import { afterEach, describe, expect, it, vi } from "vitest";
import { expireActionFeedback, withAssistantTransition } from "./action-feedback";

vi.mock("react-dom", () => ({ flushSync: (update: () => void) => update() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup(reducedMotion: boolean, startViewTransition?: (update: () => void) => { ready: Promise<void> }) {
  vi.stubGlobal("window", { matchMedia: () => ({ matches: reducedMotion }) });
  vi.stubGlobal("document", { startViewTransition });
}

describe("assistant action feedback", () => {
  it("still updates when view transitions are unsupported", () => {
    setup(false);
    const update = vi.fn();
    withAssistantTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("respects reduced motion without delaying the update", () => {
    const transition = vi.fn();
    setup(true, transition);
    const update = vi.fn();
    withAssistantTransition(update);
    expect(transition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it("commits the update once inside a supported transition", () => {
    const transition = vi.fn((update: () => void) => {
      update();
      return { ready: Promise.resolve() };
    });
    setup(false, transition);
    const update = vi.fn();
    withAssistantTransition(update);
    expect(transition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it("keeps a successful update when a newer transition skips the animation", async () => {
    setup(false, (update) => {
      update();
      return { ready: Promise.reject(new Error("Transition skipped")) };
    });
    const update = vi.fn();
    withAssistantTransition(update);
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
  });
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
