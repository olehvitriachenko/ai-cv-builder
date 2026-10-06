import type { CvDraft } from "@/lib/api/cvs";
import { isApiError } from "@/lib/api/fetcher";

/**
 * Debounced, serialized autosave of the draft. Framework-free so it can be tested without a DOM:
 * the React hook only subscribes to it.
 *
 * Rules (spec FR-014, FR-028, FR-030):
 *  - one request in flight at a time; the newest draft always wins; the revision comes from the
 *    previous response, so saves are never sent out of order or on a stale revision of our own;
 *  - `saved` is reported only after the server confirmed the save;
 *  - on a failure the unsaved draft is kept (`error`: retry sends it again);
 *  - on a revision conflict (or a CV that is gone or no longer editable) autosave stops and the
 *    local draft is kept until the user resolves it explicitly. Nothing is merged or overwritten
 *    automatically.
 */

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
/** Why a save failed: `conflict` stale revision, `gone` missing or not editable, `other` transport/server. */
export type SaveFailure = "conflict" | "gone" | "other";

export interface SaveState {
  status: SaveStatus;
  /** The server revision the next save is based on. */
  revision: number;
  failure: SaveFailure | null;
}

/** What one save carries: the draft and the target role, written together under one revision. */
export interface SavePayload {
  draft: CvDraft;
  targetRole: string;
}

export type SaveDraft = (revision: number, payload: SavePayload) => Promise<{ revision: number }>;

export interface AutosaverOptions {
  initialRevision: number;
  save: SaveDraft;
  debounceMs?: number;
}

function classify(error: unknown): SaveFailure {
  if (isApiError(error, 409) && error.code === "REVISION_CONFLICT") {
    return "conflict";
  }
  if ((isApiError(error, 409) && error.code === "CV_NOT_EDITABLE") || isApiError(error, 404)) {
    return "gone";
  }
  return "other";
}

export class DraftAutosaver {
  private state: SaveState;
  private pending: SavePayload | null = null;
  private inFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly save: SaveDraft;
  private readonly debounceMs: number;

  constructor(options: AutosaverOptions) {
    this.save = options.save;
    this.debounceMs = options.debounceMs ?? 1000;
    this.state = { status: "idle", revision: options.initialRevision, failure: null };
  }

  getState = (): SaveState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The user changed the (valid) draft or role. Schedules a save unless saving is blocked by a conflict. */
  change(payload: SavePayload): void {
    if (this.disposed) {
      return;
    }
    this.pending = payload;
    if (this.state.status === "conflict") {
      return;
    }
    if (this.state.status !== "saving") {
      this.setState({ status: "dirty", failure: null });
    }
    this.schedule();
  }

  /** Saves a pending change now and resolves with the final state (also waits for an in-flight save). */
  async flush(): Promise<SaveState> {
    this.cancelTimer();
    // Loop: a change made while a save is in flight is sent right after it.
    while (!this.disposed && (this.inFlight !== null || (this.pending !== null && this.state.status !== "conflict" && this.state.status !== "error"))) {
      if (this.inFlight !== null) {
        await this.inFlight;
      } else {
        this.start();
      }
    }
    return this.state;
  }

  /** After an `error`: send the kept draft again. */
  retry(): void {
    if (this.state.status === "error" && this.pending !== null) {
      this.cancelTimer();
      this.start();
    }
  }

  /**
   * The user chose how to leave a conflict. The caller has fetched the latest `revision`.
   * `keepPending: true` saves the local draft on top of it (an explicit overwrite); `false` drops
   * the local draft and continues from the server's version.
   */
  resolveConflict(revision: number, options: { keepPending: boolean }): void {
    this.cancelTimer();
    if (options.keepPending && this.pending !== null) {
      this.state = { status: "dirty", revision, failure: null };
      this.emit();
      this.start();
      return;
    }
    this.pending = null;
    this.setState({ status: "idle", revision, failure: null });
  }

  dispose(): void {
    this.disposed = true;
    this.cancelTimer();
    this.listeners.clear();
  }

  private schedule(): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.inFlight === null) {
        this.start();
      }
    }, this.debounceMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private start(): void {
    const payload = this.pending;
    if (payload === null || this.inFlight !== null || this.disposed) {
      return;
    }
    this.pending = null;
    this.setState({ status: "saving", failure: null });
    const run = this.save(this.state.revision, payload).then(
      (result) => {
        this.inFlight = null;
        if (this.disposed) {
          return;
        }
        const newer = this.pending !== null;
        this.state = { status: newer ? "dirty" : "saved", revision: result.revision, failure: null };
        this.emit();
        if (newer) {
          this.schedule();
        }
      },
      (error: unknown) => {
        this.inFlight = null;
        if (this.disposed) {
          return;
        }
        // Keep what failed unless the user already typed something newer.
        this.pending ??= payload;
        const failure = classify(error);
        this.setState({ status: failure === "other" ? "error" : "conflict", failure });
      },
    );
    this.inFlight = run;
  }

  private setState(patch: Partial<SaveState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
