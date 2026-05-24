import type { Commit } from "@cliff-notes/shared";

/**
 * UI-side tag: same as a shared Tag, plus an `afterIndex` indicating which
 * commit (by index in the local commits array) this tag closes. A negative or
 * out-of-bounds value means the tag is "dangling" (not associated with any
 * loaded commit) and will be rendered as an empty release group.
 */
export interface UiTag {
  name: string;
  /** Index into the commits array. -1 if dangling. */
  afterIndex: number;
  commitId?: string;
  timestamp?: number;
  message?: string;
}

/**
 * A commit in the editor. Extends the shared Commit type with `ignored`, a
 * UI-only flag that excludes the commit from the rendered changelog without
 * removing it from the editor list.
 */
export interface UiCommit extends Commit {
  ignored?: boolean;
}

export interface AppOutput {
  markdown: string;
  warnings: string[];
}
