import { create } from "zustand";
import { generateRandomCommits, type ConventionalType } from "@cliff-notes/shared";
import type { AppOutput, UiCommit, UiTag } from "./types";
import { loadFromLocalStorage, saveToLocalStorage, type PersistedState } from "./lib/storage";
import { stateToReleases } from "./lib/state-to-releases";
import { api, ApiError, AuthDisabledError, fetchCurrentUser, logoutUser, type AuthUser } from "./lib/api";
import { toast } from "./lib/toast";
import type { RenderOptionsState } from "./components/OptionsPane";

const DEFAULT_OPTIONS: RenderOptionsState = {
  unreleased: false,
  bumpedVersion: false,
};

function normalizeOptions(raw: unknown): RenderOptionsState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_OPTIONS };
  const o = raw as Partial<RenderOptionsState>;
  return {
    unreleased: typeof o.unreleased === "boolean" ? o.unreleased : DEFAULT_OPTIONS.unreleased,
    bumpedVersion:
      typeof o.bumpedVersion === "boolean" ? o.bumpedVersion : DEFAULT_OPTIONS.bumpedVersion,
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
  name: string;
  untrusted: boolean;
  output: AppOutput | null;
  isRendering: boolean;
  isLoadingRepo: boolean;
  configDirty: boolean;

  setCliffToml: (v: string) => void;
  setOptions: (patch: Partial<RenderOptionsState>) => void;
  setName: (v: string) => void;
  setUntrusted: (v: boolean) => void;

  /** Single entry point for loading external state (URL hash, file, repo). */
  applyPersistedState: (state: PersistedState) => void;

  addCommit: (c: UiCommit) => void;
  insertRandomCommits: (
    type: ConventionalType | undefined,
    breaking: boolean,
    count: number,
    squash?: boolean,
    coAuthors?: number,
  ) => void;
  updateCommit: (idx: number, patch: Partial<UiCommit>) => void;
  removeCommit: (idx: number) => void;
  moveCommit: (from: number, to: number) => void;
  clearCommits: () => void;

  addTag: (t: UiTag) => void;
  updateTag: (idx: number, patch: Partial<UiTag>) => void;
  removeTag: (idx: number) => void;
  clearTags: () => void;

  replaceAll: (input: { commits: UiCommit[]; tags: UiTag[]; cliffToml?: string }) => void;
  resetToDefaults: () => Promise<void>;
  resetConfig: () => void;
  /** Incremented on every reset so RepoLoader remounts with cleared state. */
  repoLoaderKey: number;
  resetCliffToml: () => Promise<void>;
  loadDefaultConfig: () => Promise<void>;

  render: () => Promise<void>;
  loadFromRepo: (
    url: string,
    opts?: { range?: { from?: string; to?: string }; branch?: string; cliffTomlPath?: string },
  ) => Promise<void>;

  // ── Auth ────────────────────────────────────────────────────────────────
  user: AuthUser | null;
  /** True until the first /auth/me response arrives. Prevents flash of wrong state. */
  authLoading: boolean;
  /** False when the server has AUTH_ENABLED=false. All auth UI is hidden when false. */
  authEnabled: boolean;
  /** Controls LoginModal visibility. In store (not local state) so it can be triggered programmatically. */
  loginModalOpen: boolean;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
  setLoginModalOpen: (open: boolean) => void;
}

function persisted() {
  if (typeof window === "undefined") return null;
  // URL hash is handled asynchronously in App.tsx (requires integrity verification).
  // Only load from localStorage here.
  return loadFromLocalStorage();
}

function initialState(): Pick<AppState, "cliffToml" | "commits" | "tags" | "options" | "name" | "untrusted"> {
  const p = persisted();
  if (p) {
    return {
      cliffToml: typeof p.cliffToml === "string" ? p.cliffToml : "",
      commits: Array.isArray(p.commits) ? (p.commits as UiCommit[]) : SAMPLE_COMMITS,
      tags: Array.isArray(p.tags) ? (p.tags as UiTag[]) : SAMPLE_TAGS,
      options: normalizeOptions(p.options),
      name: typeof p.name === "string" ? p.name : "",
      untrusted: typeof p.untrusted === "boolean" ? p.untrusted : false,
    };
  }
  return {
    cliffToml: "",
    commits: SAMPLE_COMMITS,
    tags: SAMPLE_TAGS,
    options: { ...DEFAULT_OPTIONS },
    name: "",
    untrusted: false,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState(),
  output: null,
  isRendering: false,
  isLoadingRepo: false,
  configDirty: false,

  repoLoaderKey: 0,

  // Auth initial state: authLoading=true prevents flash of logged-out icon
  user: null,
  authLoading: true,
  authEnabled: true,
  loginModalOpen: false,

  setCliffToml: (v) => set({ cliffToml: v, configDirty: true, untrusted: false }),
  setOptions: (patch) =>
    set((s) => ({ options: { ...s.options, ...patch }, configDirty: true, untrusted: false })),
  setName: (v) => set({ name: v, untrusted: false }),
  setUntrusted: (v) => set({ untrusted: v }),

  applyPersistedState: (state) =>
    set({
      commits: Array.isArray(state.commits) ? (state.commits as UiCommit[]) : SAMPLE_COMMITS,
      tags: Array.isArray(state.tags) ? (state.tags as UiTag[]) : SAMPLE_TAGS,
      cliffToml: typeof state.cliffToml === "string" ? state.cliffToml : "",
      options: normalizeOptions(state.options),
      name: typeof state.name === "string" ? state.name : "",
      configDirty: true,
      output: null,
    }),

  addCommit: (c) => set((s) => ({ commits: [...s.commits, c], configDirty: true, untrusted: false })),
  insertRandomCommits: (type, breaking, count, squash, coAuthors) =>
    set((s) => ({
      commits: [...s.commits, ...generateRandomCommits({ type, breaking, count, squash, coAuthors })],
      configDirty: true,
      untrusted: false,
    })),
  updateCommit: (idx, patch) =>
    set((s) => ({
      commits: s.commits.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
      configDirty: true,
      untrusted: false,
    })),
  removeCommit: (idx) =>
    set((s) => {
      const commits = s.commits.filter((_, i) => i !== idx);
      const tags = s.tags.map((t) => {
        if (t.afterIndex < 0) return t;
        if (t.afterIndex === idx) return { ...t, afterIndex: idx - 1 };
        if (t.afterIndex > idx) return { ...t, afterIndex: t.afterIndex - 1 };
        return t;
      });
      return { commits, tags, configDirty: true, untrusted: false };
    }),
  moveCommit: (from, to) =>
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.commits.length || to >= s.commits.length) {
        return {};
      }
      const commits = [...s.commits];
      const [m] = commits.splice(from, 1);
      commits.splice(to, 0, m!);
      return { commits, configDirty: true, untrusted: false };
    }),
  clearCommits: () => set({ commits: [], tags: [], configDirty: true, untrusted: false }),

  addTag: (t) => set((s) => ({ tags: [...s.tags, t], configDirty: true, untrusted: false })),
  updateTag: (idx, patch) =>
    set((s) => ({
      tags: s.tags.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
      configDirty: true,
      untrusted: false,
    })),
  removeTag: (idx) =>
    set((s) => ({ tags: s.tags.filter((_, i) => i !== idx), configDirty: true, untrusted: false })),
  clearTags: () => set({ tags: [], configDirty: true, untrusted: false }),

  replaceAll: (input) =>
    set((s) => ({
      commits: input.commits,
      tags: input.tags,
      cliffToml: input.cliffToml ?? s.cliffToml,
      configDirty: true,
      untrusted: false,
    })),

  loadDefaultConfig: async () => {
    try {
      const toml = await api.getToml("default.toml");
      set({ cliffToml: toml });
    } catch (err) {
      toast.error("Failed to load default config", { message: String(err) });
    }
  },
  resetToDefaults: async () => {
    set((s) => ({
      commits: SAMPLE_COMMITS,
      tags: SAMPLE_TAGS,
      options: { ...DEFAULT_OPTIONS },
      name: "",
      untrusted: false,
      output: null,
      configDirty: false,
      repoLoaderKey: s.repoLoaderKey + 1,
    }));
    try {
      const toml = await api.getToml("default.toml");
      set({ cliffToml: toml });
    } catch (err) {
      toast.error("Failed to load default config", { message: String(err) });
    }
  },
  resetConfig: () =>
    set((s) => ({
      commits: SAMPLE_COMMITS,
      tags: SAMPLE_TAGS,
      options: { ...DEFAULT_OPTIONS },
      output: null,
      configDirty: true,
      untrusted: false,
      repoLoaderKey: s.repoLoaderKey + 1,
    })),
  resetCliffToml: async () => {
    try {
      const toml = await api.getToml("default.toml");
      set({ cliffToml: toml, configDirty: true, untrusted: false });
    } catch (err) {
      toast.error("Failed to load default config", { message: String(err) });
    }
  },

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
        },
      });
      set({
        output: {
          markdown: out.markdown,
          warnings: out.warnings ?? [],
          mockedRemotes: out.mockedRemotes ?? [],
          hasDisabledReplaceCommands: out.hasDisabledReplaceCommands ?? false,
        },
        isRendering: false,
        configDirty: false,
      });
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

  loadFromRepo: async (url, opts) => {
    set({ isLoadingRepo: true });
    try {
      const result = await api.inspectRepo({
        url,
        range: opts?.range,
        branch: opts?.branch,
        cliffTomlPath: opts?.cliffTomlPath,
      });
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
        configDirty: true,
        untrusted: false,
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

  // ── Auth actions ─────────────────────────────────────────────────────────
  fetchUser: async () => {
    try {
      const user = await fetchCurrentUser();
      set({ user, authLoading: false });
    } catch (err) {
      if (err instanceof AuthDisabledError) {
        // Server has AUTH_ENABLED=false — hide all auth UI
        set({ user: null, authLoading: false, authEnabled: false });
      } else {
        set({ user: null, authLoading: false });
      }
    }
  },

  logout: async () => {
    try {
      await logoutUser();
    } catch {
      // Best-effort logout; clear local state regardless
    }
    set({ user: null });
  },

  setLoginModalOpen: (open) => set({ loginModalOpen: open }),
}));

if (typeof window !== "undefined") {
  useAppStore.subscribe((s) => {
    saveToLocalStorage({
      cliffToml: s.cliffToml,
      commits: s.commits,
      tags: s.tags,
      options: s.options,
      name: s.name,
      untrusted: s.untrusted,
    });
  });
}
