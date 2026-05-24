import { create } from "zustand";
import { DEFAULT_CLIFF_TOML, generateRandomCommits, type ConventionalType } from "@cliff-notes/shared";
import type { AppOutput, UiCommit, UiTag } from "./types";
import { decodeFromUrlHash, loadFromLocalStorage, saveToLocalStorage } from "./lib/storage";
import { stateToReleases } from "./lib/state-to-releases";
import { api, ApiError } from "./lib/api";
import { toast } from "./lib/toast";
import type { RenderOptionsState } from "./components/OptionsPane";

const DEFAULT_OPTIONS: RenderOptionsState = {
  unreleased: false,
  bumpedVersion: false,
  defaultVersion: "v0.1.0",
};

function normalizeOptions(raw: unknown): RenderOptionsState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_OPTIONS };
  const o = raw as Partial<RenderOptionsState>;
  return {
    unreleased: typeof o.unreleased === "boolean" ? o.unreleased : DEFAULT_OPTIONS.unreleased,
    bumpedVersion:
      typeof o.bumpedVersion === "boolean" ? o.bumpedVersion : DEFAULT_OPTIONS.bumpedVersion,
    defaultVersion:
      typeof o.defaultVersion === "string" && o.defaultVersion.length > 0
        ? o.defaultVersion
        : DEFAULT_OPTIONS.defaultVersion,
  };
}

const SAMPLE_COMMITS: UiCommit[] = [
  { message: "feat: initial release of the changelog generator" },
  { message: "feat(api): expose --from-context endpoint" },
  { message: "fix: handle empty tag list gracefully" },
  { message: "docs: explain the random commit generator" },
];

const SAMPLE_TAGS: UiTag[] = [
  { name: "v0.1.0", afterIndex: 1 },
];

interface AppState {
  cliffToml: string;
  commits: UiCommit[];
  tags: UiTag[];
  options: RenderOptionsState;
  output: AppOutput | null;
  isRendering: boolean;
  isLoadingRepo: boolean;

  setCliffToml: (v: string) => void;
  setOptions: (patch: Partial<RenderOptionsState>) => void;
  addCommit: (c: UiCommit) => void;
  insertRandomCommits: (type: ConventionalType, breaking: boolean, count: number, squash?: boolean, coAuthors?: number) => void;
  updateCommit: (idx: number, patch: Partial<UiCommit>) => void;
  removeCommit: (idx: number) => void;
  moveCommit: (from: number, to: number) => void;
  clearCommits: () => void;

  addTag: (t: UiTag) => void;
  updateTag: (idx: number, patch: Partial<UiTag>) => void;
  removeTag: (idx: number) => void;
  clearTags: () => void;

  replaceAll: (input: { commits: UiCommit[]; tags: UiTag[]; cliffToml?: string }) => void;
  resetToDefaults: () => void;

  render: () => Promise<void>;
  loadFromRepo: (url: string, range?: { from?: string; to?: string }) => Promise<void>;
}

function persisted() {
  if (typeof window === "undefined") return null;
  // URL hash wins over localStorage so shared links don't get clobbered.
  const fromHash = decodeFromUrlHash(window.location.hash);
  if (fromHash) return fromHash;
  return loadFromLocalStorage();
}

function initialState(): Pick<AppState, "cliffToml" | "commits" | "tags" | "options"> {
  const p = persisted();
  if (p) {
    return {
      cliffToml: typeof p.cliffToml === "string" ? p.cliffToml : DEFAULT_CLIFF_TOML,
      commits: Array.isArray(p.commits) ? (p.commits as UiCommit[]) : SAMPLE_COMMITS,
      tags: Array.isArray(p.tags) ? (p.tags as UiTag[]) : SAMPLE_TAGS,
      options: normalizeOptions(p.options),
    };
  }
  return {
    cliffToml: DEFAULT_CLIFF_TOML,
    commits: SAMPLE_COMMITS,
    tags: SAMPLE_TAGS,
    options: { ...DEFAULT_OPTIONS },
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState(),
  output: null,
  isRendering: false,
  isLoadingRepo: false,

  setCliffToml: (v) => set({ cliffToml: v }),
  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),

  addCommit: (c) => set((s) => ({ commits: [...s.commits, c] })),
  insertRandomCommits: (type, breaking, count, squash, coAuthors) =>
    set((s) => ({
      commits: [...s.commits, ...generateRandomCommits({ type, breaking, count, squash, coAuthors })],
    })),
  updateCommit: (idx, patch) =>
    set((s) => ({
      commits: s.commits.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    })),
  removeCommit: (idx) =>
    set((s) => {
      const commits = s.commits.filter((_, i) => i !== idx);
      // shift down any tag.afterIndex that pointed past the removed commit
      const tags = s.tags.map((t) => {
        if (t.afterIndex < 0) return t;
        if (t.afterIndex === idx) return { ...t, afterIndex: idx - 1 };
        if (t.afterIndex > idx) return { ...t, afterIndex: t.afterIndex - 1 };
        return t;
      });
      return { commits, tags };
    }),
  moveCommit: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.commits.length || to >= s.commits.length) {
        return {};
      }
      const commits = [...s.commits];
      const [m] = commits.splice(from, 1);
      commits.splice(to, 0, m!);
      return { commits };
    }),
  clearCommits: () => set({ commits: [], tags: [] }),

  addTag: (t) => set((s) => ({ tags: [...s.tags, t] })),
  updateTag: (idx, patch) =>
    set((s) => ({ tags: s.tags.map((t, i) => (i === idx ? { ...t, ...patch } : t)) })),
  removeTag: (idx) => set((s) => ({ tags: s.tags.filter((_, i) => i !== idx) })),
  clearTags: () => set({ tags: [] }),

  replaceAll: (input) =>
    set((s) => ({
      commits: input.commits,
      tags: input.tags,
      cliffToml: input.cliffToml ?? s.cliffToml,
    })),
  resetToDefaults: () =>
    set({
      cliffToml: DEFAULT_CLIFF_TOML,
      commits: SAMPLE_COMMITS,
      tags: SAMPLE_TAGS,
      options: { ...DEFAULT_OPTIONS },
      output: null,
    }),

  render: async () => {
    const { cliffToml, commits, tags, options } = get();
    if (commits.length === 0) {
      toast.error("Nothing to render", { message: "Add at least one commit before generating." });
      return;
    }
    set({ isRendering: true });
    try {
      const releases = stateToReleases(commits, tags);
      const out = await api.render({
        cliffToml,
        releases,
        options: {
          unreleased: options.unreleased,
          bumpedVersion: options.bumpedVersion,
          defaultVersion: options.defaultVersion,
        },
      });
      set({ output: { markdown: out.markdown, warnings: out.warnings ?? [] }, isRendering: false });
      if (options.bumpedVersion && out.nextTagFallback && out.nextTag) {
        toast.info("Next tag computed from fallback", {
          message: `git-cliff didn't return a bumped version; using ${out.nextTag} instead.`,
        });
      }
    } catch (err) {
      set({ isRendering: false });
      const title = err instanceof ApiError ? err.message : "Failed to generate changelog";
      const details = err instanceof ApiError ? err.detail : String(err);
      toast.error(title, details ? { details } : undefined);
    }
  },

  loadFromRepo: async (url, range) => {
    set({ isLoadingRepo: true });
    try {
      const result = await api.inspectRepo({ url, range });
      // commits come newest-first from git log; flip to oldest-first for our model.
      const commits: UiCommit[] = [...result.commits].reverse();
      const idToIndex = new Map<string, number>();
      commits.forEach((c, i) => {
        if (c.id) idToIndex.set(c.id, i);
      });
      const tags: UiTag[] = result.tags.map((t) => ({
        name: t.name,
        afterIndex: t.commitId && idToIndex.has(t.commitId) ? idToIndex.get(t.commitId)! : -1,
        commitId: t.commitId,
        timestamp: t.timestamp,
        message: t.message,
      }));
      set({
        commits,
        tags,
        cliffToml: result.cliffToml ?? get().cliffToml,
        isLoadingRepo: false,
      });
      toast.success("Repository loaded", {
        message: `${commits.length} commit${commits.length === 1 ? "" : "s"}, ${tags.length} tag${tags.length === 1 ? "" : "s"}`,
      });
    } catch (err) {
      set({ isLoadingRepo: false });
      const title = err instanceof ApiError ? err.message : "Failed to load repository";
      const details = err instanceof ApiError ? err.detail : String(err);
      toast.error(title, details ? { details } : undefined);
    }
  },
}));

if (typeof window !== "undefined") {
  // Persist (without `output`/`isRendering`) on every change.
  useAppStore.subscribe((s) => {
    saveToLocalStorage({
      cliffToml: s.cliffToml,
      commits: s.commits,
      tags: s.tags,
      options: s.options,
    });
  });
}
