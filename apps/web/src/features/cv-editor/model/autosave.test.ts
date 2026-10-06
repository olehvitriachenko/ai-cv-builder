import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/fetcher";
import type { CvDraft } from "@/entities/cv/schemas";
import { DraftAutosaver, type SaveState, type SavePayload } from "./autosave";

function draftOf(summary: string): CvDraft {
  return {
    schemaVersion: 2,
    contact: { fullName: "Ada", email: null, phone: null, location: null, links: [] },
    summary,
    experience: [],
    education: [],
    languages: [], certifications: [], portfolio: [], hobbies: [], customSections: [],
    skillCategories: [],
  };
}

function draftWith(summary: string, targetRole = "Backend Engineer"): SavePayload {
  return { draft: draftOf(summary), targetRole };
}

interface Pending {
  revision: number;
  payload: SavePayload;
  resolve: (revision: number) => void;
  reject: (error: unknown) => void;
}

function setup(initialRevision = 0) {
  const calls: Pending[] = [];
  const save = (revision: number, payload: SavePayload) =>
    new Promise<{ revision: number }>((resolve, reject) => {
      calls.push({ revision, payload, resolve: (next) => resolve({ revision: next }), reject });
    });
  const autosaver = new DraftAutosaver({ initialRevision, save, debounceMs: 1000 });
  const states: SaveState["status"][] = [];
  autosaver.subscribe(() => states.push(autosaver.getState().status));
  return { autosaver, calls, states };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("DraftAutosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts idle and becomes dirty on a change without saving yet", () => {
    const { autosaver, calls } = setup();

    expect(autosaver.getState().status).toBe("idle");
    autosaver.change(draftWith("a"));

    expect(autosaver.getState().status).toBe("dirty");
    expect(calls).toHaveLength(0);
  });

  it("saves once after the debounce, with the revision it holds, then reports saved", async () => {
    const { autosaver, calls } = setup(4);
    autosaver.change(draftWith("a"));

    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(autosaver.getState().status).toBe("saving");
    expect(calls[0]).toMatchObject({ revision: 4 });

    calls[0]?.resolve(5);
    await settle();

    expect(autosaver.getState()).toMatchObject({ status: "saved", revision: 5 });
  });

  it("sends the target role with the draft in the same save", async () => {
    const { autosaver, calls } = setup();
    autosaver.change(draftWith("a", "Platform Engineer"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls[0]?.payload.targetRole).toBe("Platform Engineer");
  });

  it("saves a target role change on its own, and the newest role wins when edits coalesce", async () => {
    const { autosaver, calls } = setup();
    autosaver.change(draftWith("same", "Engineer"));
    await vi.advanceTimersByTimeAsync(500);
    autosaver.change(draftWith("same", "Staff Engineer"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload.targetRole).toBe("Staff Engineer");
  });

  it("coalesces rapid changes into one save of the latest draft", async () => {
    const { autosaver, calls } = setup();
    autosaver.change(draftWith("a"));
    await vi.advanceTimersByTimeAsync(600);
    autosaver.change(draftWith("ab"));
    await vi.advanceTimersByTimeAsync(600);
    autosaver.change(draftWith("abc"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload.draft.summary).toBe("abc");
  });

  it("never runs two saves at once; a change during a save is sent after it with the new revision", async () => {
    const { autosaver, calls } = setup(0);
    autosaver.change(draftWith("one"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);

    autosaver.change(draftWith("two"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);

    calls[0]?.resolve(1);
    await settle();
    await vi.advanceTimersByTimeAsync(1000);

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ revision: 1 });
    expect(calls[1]?.payload.draft.summary).toBe("two");
    calls[1]?.resolve(2);
    await settle();
    expect(autosaver.getState()).toMatchObject({ status: "saved", revision: 2 });
  });

  it("reports error, keeps the unsaved draft and never says saved when the save failed", async () => {
    const { autosaver, calls, states } = setup();
    autosaver.change(draftWith("a"));
    await vi.advanceTimersByTimeAsync(1000);

    calls[0]?.reject(new ApiError(0, "NETWORK", "offline"));
    await settle();

    expect(autosaver.getState()).toMatchObject({ status: "error", failure: "other" });
    expect(states).not.toContain("saved");

    autosaver.retry();
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.payload.draft.summary).toBe("a");
    calls[1]?.resolve(1);
    await settle();
    expect(autosaver.getState().status).toBe("saved");
  });

  it("goes to conflict on REVISION_CONFLICT and stops saving until resolved", async () => {
    const { autosaver, calls } = setup(1);
    autosaver.change(draftWith("mine"));
    await vi.advanceTimersByTimeAsync(1000);

    calls[0]?.reject(new ApiError(409, "REVISION_CONFLICT", "stale"));
    await settle();
    expect(autosaver.getState()).toMatchObject({ status: "conflict", failure: "conflict" });

    autosaver.change(draftWith("mine, edited more"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(1);
    expect(autosaver.getState().status).toBe("conflict");
  });

  it("treats CV_NOT_EDITABLE and a 404 as a conflict that cannot be saved over", async () => {
    for (const error of [new ApiError(409, "CV_NOT_EDITABLE", "x"), new ApiError(404, "CV_NOT_FOUND", "x")]) {
      const { autosaver, calls } = setup();
      autosaver.change(draftWith("a"));
      await vi.advanceTimersByTimeAsync(1000);
      calls[0]?.reject(error);
      await settle();
      expect(autosaver.getState()).toMatchObject({ status: "conflict", failure: "gone" });
    }
  });

  it("resolveConflict adopts the latest revision and, for keepMine, saves the pending draft on it", async () => {
    const { autosaver, calls } = setup(1);
    autosaver.change(draftWith("mine"));
    await vi.advanceTimersByTimeAsync(1000);
    calls[0]?.reject(new ApiError(409, "REVISION_CONFLICT", "stale"));
    await settle();

    autosaver.resolveConflict(7, { keepPending: true });
    await settle();

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ revision: 7 });
    expect(calls[1]?.payload.draft.summary).toBe("mine");
    calls[1]?.resolve(8);
    await settle();
    expect(autosaver.getState()).toMatchObject({ status: "saved", revision: 8 });
  });

  it("resolveConflict without keepPending drops the pending draft and goes idle on the latest revision", async () => {
    const { autosaver, calls } = setup(1);
    autosaver.change(draftWith("mine"));
    await vi.advanceTimersByTimeAsync(1000);
    calls[0]?.reject(new ApiError(409, "REVISION_CONFLICT", "stale"));
    await settle();

    autosaver.resolveConflict(7, { keepPending: false });
    await vi.advanceTimersByTimeAsync(5000);

    expect(calls).toHaveLength(1);
    expect(autosaver.getState()).toMatchObject({ status: "idle", revision: 7 });
  });

  it("flush saves a pending change at once and resolves with the final state", async () => {
    const { autosaver, calls } = setup(2);
    autosaver.change(draftWith("a"));

    const flushed = autosaver.flush();
    await settle();
    expect(calls).toHaveLength(1);
    calls[0]?.resolve(3);

    expect(await flushed).toMatchObject({ status: "saved", revision: 3 });
  });

  it("flush with nothing pending resolves immediately and sends nothing", async () => {
    const { autosaver, calls } = setup();

    expect(await autosaver.flush()).toMatchObject({ status: "idle" });
    expect(calls).toHaveLength(0);
  });

  it("flush waits for an in-flight save and then saves the newer change", async () => {
    const { autosaver, calls } = setup(0);
    autosaver.change(draftWith("one"));
    await vi.advanceTimersByTimeAsync(1000);
    autosaver.change(draftWith("two"));

    const flushed = autosaver.flush();
    calls[0]?.resolve(1);
    await settle();
    expect(calls).toHaveLength(2);
    calls[1]?.resolve(2);

    expect(await flushed).toMatchObject({ status: "saved", revision: 2 });
  });

  it("dispose cancels the pending save", async () => {
    const { autosaver, calls } = setup();
    autosaver.change(draftWith("a"));

    autosaver.dispose();
    await vi.advanceTimersByTimeAsync(5000);

    expect(calls).toHaveLength(0);
  });
});
