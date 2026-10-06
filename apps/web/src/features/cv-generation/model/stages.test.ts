import { describe, expect, it } from "vitest";
import { stageStates } from "./stages";

describe("stageStates", () => {
  it("waits on PENDING and works on the second stage while PROCESSING", () => {
    expect(stageStates("PENDING")).toEqual({ preparing: "done", structuring: "waiting", generating: "waiting" });
    expect(stageStates("PROCESSING")).toEqual({ preparing: "done", structuring: "active", generating: "waiting" });
  });

  it("marks all three stages done on COMPLETED", () => {
    expect(stageStates("COMPLETED")).toEqual({ preparing: "done", structuring: "done", generating: "done" });
  });

  it("stops on the second stage on FAILED", () => {
    expect(stageStates("FAILED")).toEqual({ preparing: "done", structuring: "failed", generating: "waiting" });
  });
});
