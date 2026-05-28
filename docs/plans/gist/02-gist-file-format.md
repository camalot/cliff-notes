# Unit 2 — Gist File Format & Playground ID

Defines the gist file naming conventions, metadata structure, tree-parsing utilities,
and the new per-playground `playgroundId`.

**Depends on:** nothing
**Required by:** Unit 4 (GistExplorer), Unit 5 (Save), Unit 6 (Load)

---

## Phase 1: `playgroundId` in State

### 1a. `PersistedState` (`apps/web/src/lib/storage.ts`)

```diff
  export interface PersistedState {
    cliffToml: string;
    commits: UiCommit[];
    tags: UiTag[];
    options?: RenderOptionsState;
    name?: string;
    untrusted?: boolean;
+   playgroundId?: string;   // stable UUID for Gist addressing; absent = legacy
  }
```

No schema version bump needed — `playgroundId` is optional and ignored on load
by systems that don't know about it.

### 1b. `AppState` (`apps/web/src/store.ts`)

Add to state interface and `initialState()`:

```diff
  interface AppState {
    // ... existing fields ...
+   playgroundId: string | null;   // null until first Gist save
+   gistProjectId: string | null;  // project-group UUID within the Gist
  }
```

Add actions:

```diff
+   setPlaygroundId: (id: string) => void;
+   setGistProjectId: (id: string) => void;
```

Implement in the `create` call:

```ts
setPlaygroundId: (id) => set({ playgroundId: id }),
setGistProjectId: (id) => set({ gistProjectId: id }),
```

In `applyPersistedState`:

```diff
  applyPersistedState: (state) => {
    set({
      cliffToml: state.cliffToml,
      commits: state.commits,
      tags: state.tags,
      options: state.options ?? DEFAULT_OPTIONS,
      name: state.name ?? "",
      untrusted: state.untrusted ?? false,
+     playgroundId: state.playgroundId ?? null,
    });
  },
```

In `saveToLocalStorage` subscriber, include `playgroundId`:

```diff
- const { cliffToml, commits, tags, options, name, untrusted } = s;
+ const { cliffToml, commits, tags, options, name, untrusted, playgroundId } = s;
  saveToLocalStorage({
    cliffToml, commits, tags, options, name, untrusted,
+   playgroundId: playgroundId ?? undefined,
  });
```

### 1c. `serializePlayground` (`apps/web/src/lib/playground-file.ts`)

The `id` in the `.cliff-notes` YAML metadata should use `playgroundId` when present,
falling back to `getProjectId()` for backward-compat:

```diff
  export async function serializePlayground(state: PersistedState): Promise<string> {
-   const id = getProjectId();
+   const id = state.playgroundId ?? getProjectId();
```

---

## Phase 2: Gist Format Types & Utilities

Create **`apps/web/src/lib/gist-format.ts`**:

```ts
// ── Types ────────────────────────────────────────────────────────────────────

export interface GistProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  playgrounds: GistPlayground[];
}

export interface GistPlayground {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Full gist filename: "<projectId>/<playgroundId>.cliff-notes" */
  filename: string;
  rawUrl: string | null;
  truncated: boolean;
}

export interface GistProjectMetadata {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface GistPlaygroundMetadata {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// Imported from api.ts shape:
export interface GistFileEntry {
  filename: string;
  size: number;
  raw_url: string;
  truncated: boolean;
  content?: string;
}

// ── File name helpers ────────────────────────────────────────────────────────

export const GIST_MARKER_FILE = "cliff-notes.gist";

/** Returns the metadata filename for a project. */
export function projectMetadataFilename(projectId: string): string {
  return `${projectId}.metadata`;
}

/** Returns the .cliff-notes filename for a playground. */
export function playgroundFilename(projectId: string, playgroundId: string): string {
  return `${projectId}/${playgroundId}.cliff-notes`;
}

/** Returns the metadata filename for a playground. */
export function playgroundMetadataFilename(
  projectId: string,
  playgroundId: string,
): string {
  return `${projectId}/${playgroundId}.metadata`;
}

/** Content of the marker file (stringified JSON). */
export function buildMarkerContent(): string {
  return JSON.stringify({ version: "1", app: "cliff-notes.dev" }, null, 2);
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse the flat files map from a GitHub Gist response into a GistProject tree.
 *
 * Files in the gist have names like:
 *   cliff-notes.gist                     ← marker
 *   <projectId>.metadata                 ← project metadata
 *   <projectId>/<playgroundId>.cliff-notes
 *   <projectId>/<playgroundId>.metadata
 */
export function parseGistTree(
  files: Record<string, GistFileEntry>,
): GistProject[] {
  const projects = new Map<string, GistProject>();

  // ── Pass 1: collect project metadata ─────────────────────────────────
  for (const [filename, entry] of Object.entries(files)) {
    const projectMetaMatch = filename.match(/^([^/]+)\.metadata$/);
    if (!projectMetaMatch) continue;
    const projectId = projectMetaMatch[1]!;

    let meta: GistProjectMetadata;
    try {
      meta = JSON.parse(entry.content ?? "{}") as GistProjectMetadata;
    } catch {
      // Malformed metadata: synthesise from filename
      meta = {
        id: projectId,
        name: projectId,
        description: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    projects.set(projectId, {
      id: projectId,
      name: meta.name || projectId,
      description: meta.description ?? "",
      createdAt: meta.createdAt ?? new Date().toISOString(),
      updatedAt: meta.updatedAt ?? new Date().toISOString(),
      playgrounds: [],
    });
  }

  // ── Pass 2: collect playground files ─────────────────────────────────
  for (const [filename, entry] of Object.entries(files)) {
    const playgroundMatch = filename.match(/^([^/]+)\/([^/]+)\.cliff-notes$/);
    if (!playgroundMatch) continue;
    const [, projectId, playgroundId] = playgroundMatch;

    // Ensure parent project exists (even if no .metadata file)
    if (!projects.has(projectId!)) {
      projects.set(projectId!, {
        id: projectId!,
        name: projectId!,
        description: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        playgrounds: [],
      });
    }

    // Look for the companion .metadata file
    const metaFilename = playgroundMetadataFilename(projectId!, playgroundId!);
    const metaEntry = files[metaFilename];
    let meta: Partial<GistPlaygroundMetadata> = {};
    if (metaEntry?.content) {
      try {
        meta = JSON.parse(metaEntry.content) as GistPlaygroundMetadata;
      } catch {
        // ignore
      }
    }

    projects.get(projectId!)!.playgrounds.push({
      id: playgroundId!,
      projectId: projectId!,
      name: meta.name || playgroundId!,
      description: meta.description ?? "",
      createdAt: meta.createdAt ?? new Date().toISOString(),
      updatedAt: meta.updatedAt ?? new Date().toISOString(),
      filename,
      rawUrl: entry.truncated ? entry.raw_url : null,
      truncated: entry.truncated,
    });
  }

  // Sort projects and playgrounds by name for stable ordering
  const sorted = [...projects.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const project of sorted) {
    project.playgrounds.sort((a, b) => a.name.localeCompare(b.name));
  }

  return sorted;
}

// ── Serialisation ────────────────────────────────────────────────────────────

/** Build the file map to PATCH/POST when saving a playground to the Gist. */
export function buildGistSaveFiles(opts: {
  projectId: string;
  projectName: string;
  projectDescription?: string;
  playgroundId: string;
  playgroundName: string;
  playgroundDescription?: string;
  playgroundContent: string;         // full .cliff-notes YAML
  now?: string;                      // ISO timestamp, defaults to Date.now()
  existingProjectCreatedAt?: string; // preserve original createdAt when updating
  existingPlaygroundCreatedAt?: string;
}): Record<string, string> {
  const now = opts.now ?? new Date().toISOString();

  const projectMeta: GistProjectMetadata = {
    id: opts.projectId,
    name: opts.projectName,
    description: opts.projectDescription ?? "",
    createdAt: opts.existingProjectCreatedAt ?? now,
    updatedAt: now,
  };

  const playgroundMeta: GistPlaygroundMetadata = {
    id: opts.playgroundId,
    projectId: opts.projectId,
    name: opts.playgroundName,
    description: opts.playgroundDescription ?? "",
    createdAt: opts.existingPlaygroundCreatedAt ?? now,
    updatedAt: now,
  };

  return {
    [GIST_MARKER_FILE]: buildMarkerContent(),
    [projectMetadataFilename(opts.projectId)]: JSON.stringify(projectMeta, null, 2),
    [playgroundFilename(opts.projectId, opts.playgroundId)]: opts.playgroundContent,
    [playgroundMetadataFilename(opts.projectId, opts.playgroundId)]:
      JSON.stringify(playgroundMeta, null, 2),
  };
}
```

---

## Phase 3: `playgroundId` Generation Helper

Add to **`apps/web/src/lib/gist-format.ts`** (or a small utility):

```ts
/** Generate a new stable UUID for a playground. */
export function generatePlaygroundId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (older test runners)
  return `pid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
```

---

## Verification Checklist

- [ ] `pnpm --filter web typecheck` passes after `PersistedState` change
- [ ] Existing `.cliff-notes` files without `playgroundId` still load correctly
- [ ] `parseGistTree` with a known fixture produces the expected `GistProject[]` tree
- [ ] `buildGistSaveFiles` produces the correct 4-file map
- [ ] `serializePlayground` uses `playgroundId` when present
- [ ] Loading a `.cliff-notes` file with `playgroundId` restores it into state
