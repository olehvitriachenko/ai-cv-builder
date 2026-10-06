import type { CvListItem } from "@/entities/cv/schemas";
import { isApiError } from "@/shared/api/fetcher";
import type { SaveState } from "../../cv-editor/model/autosave";

/** What the PDF request returns: the file and the server's suggested name (the raw header). */
export interface PdfResponse {
  blob: Blob;
  contentDisposition: string | null;
}

const DEFAULT_FILENAME = "CV.pdf";

function hasControlCharacters(text: string): boolean {
  return Array.from(text).some((char) => char.charCodeAt(0) < 32);
}

/** Never lets a header choose a path or a non-PDF name: base name only, always ending in `.pdf`. */
function safeFilename(name: string): string {
  const base = name.replaceAll("\\", "/").split("/").pop()?.trim() ?? "";
  if (base === "" || hasControlCharacters(base)) {
    return DEFAULT_FILENAME;
  }
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

/**
 * The file name from a `Content-Disposition` header: the UTF-8 name (`filename*`) first, then the
 * plain `filename`, then `CV.pdf`.
 */
export function filenameFromDisposition(header: string | null): string {
  if (header === null) {
    return DEFAULT_FILENAME;
  }
  const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return safeFilename(decodeURIComponent(utf8[1].trim()));
    } catch {
      // A malformed percent-encoding: use the plain name below.
    }
  }
  const plain = /(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(header);
  const value = plain?.[1] ?? plain?.[2];
  return value ? safeFilename(value) : DEFAULT_FILENAME;
}

/** A card can offer the download once the CV has a draft (Draft or Completed). */
export function canDownloadFromList(item: Pick<CvListItem, "displayStatus">): boolean {
  return item.displayStatus === "DRAFT" || item.displayStatus === "COMPLETED";
}

/** Why the card's Download PDF is unavailable, or null when it is available. */
export function downloadDisabledReason(item: Pick<CvListItem, "displayStatus">): string | null {
  if (canDownloadFromList(item)) {
    return null;
  }
  return item.displayStatus === "FAILED"
    ? "No draft yet. Retry the generation first."
    : "Available once your CV is ready.";
}

export type DownloadOutcome =
  /** The session expired: send the person to sign in. */
  | { kind: "signin" }
  | { kind: "failed"; message: string };

/** What to tell the person about a failed download; never server text. */
export function downloadOutcome(error: unknown): DownloadOutcome {
  if (isApiError(error, 401)) {
    return { kind: "signin" };
  }
  if (isApiError(error, 404)) {
    return { kind: "failed", message: "This CV no longer exists." };
  }
  if (isApiError(error, 409)) {
    return {
      kind: "failed",
      message: "This CV isn’t ready to download yet. Check its status in My CVs.",
    };
  }
  return { kind: "failed", message: "We couldn’t prepare your PDF. Try again." };
}

/** The download was not attempted (the form has errors, or the latest edits are not saved). */
export class DownloadBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadBlockedError";
  }
}

export interface PrepareDownloadDeps {
  /** Why downloading is impossible right now (for example an invalid form), or null. */
  blockedReason: string | null;
  /** Sends any pending edit and resolves with the autosaver's final state. */
  flush: () => Promise<SaveState>;
}

/**
 * The editor's gate: the PDF is the latest *saved* draft, so pending edits are saved first, and
 * nothing is downloaded when they cannot be (the person would get a file that differs from the
 * screen). Mirrors the apply flow.
 */
export async function prepareDownload({ blockedReason, flush }: PrepareDownloadDeps): Promise<void> {
  if (blockedReason !== null) {
    throw new DownloadBlockedError(blockedReason);
  }
  const final = await flush();
  if (final.status === "error") {
    throw new DownloadBlockedError(
      "Your latest edits couldn’t be saved yet, so the PDF wasn’t downloaded. Try saving again first.",
    );
  }
  if (final.status === "conflict") {
    throw new DownloadBlockedError(
      final.failure === "gone"
        ? "This CV can’t be edited any more, so the PDF wasn’t downloaded."
        : "This CV changed somewhere else. Resolve that first (load the latest version), then download the PDF.",
    );
  }
}

/** The browser calls the download needs; injected so the flow is testable without a DOM. */
export interface BrowserDownload {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  click: (url: string, filename: string) => void;
  /** Runs the action a little later (the object URL must outlive the click on some browsers). */
  later: (action: () => void) => void;
}

export function browserDownload(): BrowserDownload {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    click: (url, filename) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
    later: (action) => {
      window.setTimeout(action, 10_000);
    },
  };
}

/** Hands the file to the browser's download: one object URL, one click, then it is released. */
export function saveBlob(blob: Blob, filename: string, browser: BrowserDownload): void {
  const url = browser.createObjectUrl(blob);
  browser.click(url, filename);
  browser.later(() => browser.revokeObjectUrl(url));
}

export interface DownloadPdfDeps {
  fetchPdf: () => Promise<PdfResponse>;
  browser: BrowserDownload;
}

/** Fetches the PDF and saves it under the server's file name. Errors pass through unchanged. */
export async function downloadPdf({ fetchPdf, browser }: DownloadPdfDeps): Promise<void> {
  const { blob, contentDisposition } = await fetchPdf();
  saveBlob(blob, filenameFromDisposition(contentDisposition), browser);
}
