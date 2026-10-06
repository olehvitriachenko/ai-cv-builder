import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/fetcher";
import type { SaveState } from "./autosave";
import {
  DownloadBlockedError,
  canDownloadFromList,
  downloadDisabledReason,
  downloadOutcome,
  downloadPdf,
  filenameFromDisposition,
  prepareDownload,
  saveBlob,
  type BrowserDownload,
} from "./download-flow";

const saved: SaveState = { status: "saved", revision: 3, failure: null };

describe("filenameFromDisposition", () => {
  it("prefers the UTF-8 name (filename*) and decodes it", () => {
    const header = `attachment; filename="Backend-Engineer.pdf"; filename*=UTF-8''${encodeURIComponent("Олена-Іваненко-Backend-Engineer.pdf")}`;
    expect(filenameFromDisposition(header)).toBe("Олена-Іваненко-Backend-Engineer.pdf");
  });

  it("falls back to the plain filename", () => {
    expect(filenameFromDisposition('attachment; filename="Ada-Lovelace-Dev.pdf"')).toBe("Ada-Lovelace-Dev.pdf");
  });

  it("falls back to CV.pdf when the header is missing or unusable", () => {
    expect(filenameFromDisposition(null)).toBe("CV.pdf");
    expect(filenameFromDisposition("attachment")).toBe("CV.pdf");
    expect(filenameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A")).toBe("CV.pdf");
  });

  it("never lets the header choose a path or a non-PDF name", () => {
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"')).toBe("passwd.pdf");
    expect(filenameFromDisposition('attachment; filename="evil.exe"')).toBe("evil.exe.pdf");
    expect(filenameFromDisposition('attachment; filename="a\\b/c.pdf"')).toBe("c.pdf");
  });
});

describe("canDownloadFromList / downloadDisabledReason", () => {
  it("is available only when the CV has a draft (Draft or Completed)", () => {
    expect(canDownloadFromList({ displayStatus: "DRAFT" })).toBe(true);
    expect(canDownloadFromList({ displayStatus: "COMPLETED" })).toBe(true);
    expect(canDownloadFromList({ displayStatus: "PROCESSING" })).toBe(false);
    expect(canDownloadFromList({ displayStatus: "FAILED" })).toBe(false);
  });

  it("explains why it is not available", () => {
    expect(downloadDisabledReason({ displayStatus: "PROCESSING" })).toMatch(/ready/i);
    expect(downloadDisabledReason({ displayStatus: "FAILED" })).toMatch(/draft|generation/i);
    expect(downloadDisabledReason({ displayStatus: "DRAFT" })).toBeNull();
    expect(downloadDisabledReason({ displayStatus: "COMPLETED" })).toBeNull();
  });
});

describe("downloadOutcome", () => {
  it("sends the person to sign in when the session is gone", () => {
    expect(downloadOutcome(new ApiError(401, "UNAUTHENTICATED", "x"))).toEqual({ kind: "signin" });
  });

  it("explains a CV that is gone or not ready, without server text", () => {
    expect(downloadOutcome(new ApiError(404, "CV_NOT_FOUND", "secret"))).toEqual({
      kind: "failed",
      message: "This CV no longer exists.",
    });
    const notReady = downloadOutcome(new ApiError(409, "GENERATION_NOT_READY", "secret"));
    expect(notReady).toMatchObject({ kind: "failed" });
    expect(JSON.stringify(notReady)).not.toContain("secret");
  });

  it("uses one clear retry message for network and server failures", () => {
    const message = "We couldn’t prepare your PDF. Try again.";
    expect(downloadOutcome(new ApiError(0, "NETWORK_ERROR", "x"))).toEqual({ kind: "failed", message });
    expect(downloadOutcome(new ApiError(500, "INTERNAL_ERROR", "stack trace"))).toEqual({ kind: "failed", message });
    expect(downloadOutcome(new Error("boom"))).toEqual({ kind: "failed", message });
  });
});

describe("prepareDownload (the editor gate)", () => {
  it("does nothing when the form is valid and the edits are saved", async () => {
    const flush = vi.fn().mockResolvedValue(saved);
    await expect(prepareDownload({ blockedReason: null, flush })).resolves.toBeUndefined();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("refuses an invalid form without saving or fetching anything", async () => {
    const flush = vi.fn();
    await expect(
      prepareDownload({ blockedReason: "Fix the highlighted fields first, then download the PDF.", flush }),
    ).rejects.toThrow(DownloadBlockedError);
    expect(flush).not.toHaveBeenCalled();
  });

  it("refuses when the latest edits could not be saved", async () => {
    const flush = vi.fn().mockResolvedValue({ status: "error", revision: 3, failure: "other" } satisfies SaveState);
    await expect(prepareDownload({ blockedReason: null, flush })).rejects.toThrow(/couldn’t be saved/);
  });

  it("refuses on an unresolved conflict, with different advice when the CV is gone", async () => {
    const conflict = vi.fn().mockResolvedValue({ status: "conflict", revision: 3, failure: "conflict" } satisfies SaveState);
    await expect(prepareDownload({ blockedReason: null, flush: conflict })).rejects.toThrow(/changed somewhere else/);
    const gone = vi.fn().mockResolvedValue({ status: "conflict", revision: 3, failure: "gone" } satisfies SaveState);
    await expect(prepareDownload({ blockedReason: null, flush: gone })).rejects.toThrow(/can’t be edited any more/);
  });
});

function fakeBrowser(): BrowserDownload & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    createObjectUrl: (blob) => {
      calls.push(`create:${blob.size}`);
      return "blob:fake-url";
    },
    revokeObjectUrl: (url) => {
      calls.push(`revoke:${url}`);
    },
    click: (url, filename) => {
      calls.push(`click:${url}:${filename}`);
    },
    later: (action) => {
      calls.push("later");
      action();
    },
  };
}

describe("saveBlob", () => {
  it("creates one object URL, clicks it once with the file name, then revokes it", () => {
    const browser = fakeBrowser();

    saveBlob(new Blob(["%PDF-1.4"]), "Ada-Lovelace-Dev.pdf", browser);

    expect(browser.calls).toEqual([
      "create:8",
      "click:blob:fake-url:Ada-Lovelace-Dev.pdf",
      "later",
      "revoke:blob:fake-url",
    ]);
  });
});

describe("downloadPdf", () => {
  it("fetches the PDF, names it from the response and saves it", async () => {
    const browser = fakeBrowser();
    const fetchPdf = vi.fn().mockResolvedValue({
      blob: new Blob(["%PDF-1.4 abc"]),
      contentDisposition: `attachment; filename="Dev.pdf"; filename*=UTF-8''Dev.pdf`,
    });

    await downloadPdf({ fetchPdf, browser });

    expect(fetchPdf).toHaveBeenCalledTimes(1);
    expect(browser.calls).toContain("click:blob:fake-url:Dev.pdf");
  });

  it("saves nothing when the request fails, and passes the error on", async () => {
    const browser = fakeBrowser();
    const failure = new ApiError(409, "GENERATION_NOT_READY", "not ready");

    await expect(downloadPdf({ fetchPdf: () => Promise.reject(failure), browser })).rejects.toBe(failure);
    expect(browser.calls).toEqual([]);
  });
});
