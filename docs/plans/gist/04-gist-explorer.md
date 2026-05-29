# Unit 4 — GistExplorer Component

A tree-view file browser for navigating gist projects and playgrounds.
Used in both the Save and Load Gist flows.

**Depends on:** Unit 2 (gist-format types), Unit 3 (gist-config), Unit 1 (api)
**Required by:** Unit 5 (Save), Unit 6 (Load)

---

## Phase 1: Static Tree Component

Build the component that renders a given tree without data fetching.
This lets Save/Load modals be developed and tested independently.

### Props Interface

```ts
// apps/web/src/components/GistExplorer.tsx

import type { GistProject, GistPlayground } from "../lib/gist-format";

export type GistExplorerMode = "open" | "save";

export interface GistExplorerProps {
  mode: GistExplorerMode;

  projects: GistProject[];
  loading: boolean;
  error: string | null;

  onRefresh: () => void;

  // ── open mode ────────────────────────────────────────────────
  /** Currently selected playground filename (open mode only). */
  selectedFilename?: string | null;
  onSelectPlayground?: (playground: GistPlayground) => void;

  // ── save mode ────────────────────────────────────────────────
  /** ID of the selected project to save into (save mode only). */
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string) => void;

  /** Existing playground to overwrite (save mode, optional). */
  selectedPlaygroundId?: string | null;
  onSelectExistingPlayground?: (playground: GistPlayground | null) => void;

  /** Callback to add a new project. Receives the desired name. */
  onCreateProject?: (name: string) => void;

  /** Controlled filename for save mode. */
  fileName?: string;
  onFileNameChange?: (name: string) => void;
}
```

### Component Structure

```tsx
export function GistExplorer(props: GistExplorerProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);

  function toggleProject(id: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Auto-expand the selected project
  useEffect(() => {
    if (props.selectedProjectId) {
      setExpandedProjects((prev) => new Set([...prev, props.selectedProjectId!]));
    }
  }, [props.selectedProjectId]);

  if (props.loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        <ProgressBar />
        <span className="ml-2">Loading Gist…</span>
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="flex flex-col items-center gap-2 p-4">
        <p className="text-sm text-destructive">{props.error}</p>
        <Button variant="secondary" size="sm" onClick={props.onRefresh}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Tree */}
      <div className="border border-border rounded-md overflow-y-auto max-h-64 p-1 text-sm">
        {props.projects.length === 0 && (
          <p className="text-muted-foreground text-xs p-2">No projects yet.</p>
        )}
        {props.projects.map((project) => (
          <ProjectNode
            key={project.id}
            project={project}
            mode={props.mode}
            expanded={expandedProjects.has(project.id)}
            onToggle={() => toggleProject(project.id)}
            selectedProjectId={props.selectedProjectId}
            selectedPlaygroundId={props.selectedPlaygroundId}
            selectedFilename={props.selectedFilename}
            onSelectProject={props.onSelectProject}
            onSelectPlayground={props.onSelectPlayground}
            onSelectExistingPlayground={props.onSelectExistingPlayground}
          />
        ))}
      </div>

      {/* New project input (save mode only) */}
      {props.mode === "save" && (
        <div className="flex items-center gap-1 mt-1">
          {showNewProjectInput ? (
            <>
              <input
                autoFocus
                className="flex-1 text-sm border border-border rounded px-2 py-1 bg-background text-foreground"
                placeholder="Project name…"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newProjectName.trim()) {
                    props.onCreateProject?.(newProjectName.trim());
                    setNewProjectName("");
                    setShowNewProjectInput(false);
                  }
                  if (e.key === "Escape") {
                    setShowNewProjectInput(false);
                    setNewProjectName("");
                  }
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (newProjectName.trim()) {
                    props.onCreateProject?.(newProjectName.trim());
                  }
                  setShowNewProjectInput(false);
                  setNewProjectName("");
                }}
              >
                Add
              </Button>
            </>
          ) : (
            <IconButton
              icon="bs:folder-plus"
              label="New project"
              onClick={() => setShowNewProjectInput(true)}
              title="New project"
            />
          )}
        </div>
      )}

      {/* Filename input (save mode only) */}
      {props.mode === "save" && props.selectedProjectId && (
        <div className="flex flex-col gap-1 mt-2">
          <label className="text-xs text-muted-foreground">File name</label>
          <Input
            value={props.fileName ?? ""}
            onChange={(e) => props.onFileNameChange?.(e.target.value)}
            placeholder="playground-name.cliff-notes"
          />
        </div>
      )}
    </div>
  );
}
```

### `ProjectNode` sub-component

```tsx
function ProjectNode({
  project,
  mode,
  expanded,
  onToggle,
  selectedProjectId,
  selectedPlaygroundId,
  selectedFilename,
  onSelectProject,
  onSelectPlayground,
  onSelectExistingPlayground,
}: {
  project: GistProject;
  mode: GistExplorerMode;
  expanded: boolean;
  onToggle: () => void;
  selectedProjectId?: string | null;
  selectedPlaygroundId?: string | null;
  selectedFilename?: string | null;
  onSelectProject?: (id: string) => void;
  onSelectPlayground?: (pg: GistPlayground) => void;
  onSelectExistingPlayground?: (pg: GistPlayground | null) => void;
}) {
  const isSelected = mode === "save" && selectedProjectId === project.id;

  return (
    <div>
      <button
        type="button"
        className={cn(
          "flex items-center gap-1 w-full px-1 py-0.5 rounded text-left hover:bg-accent",
          isSelected && "bg-accent",
        )}
        onClick={() => {
          onToggle();
          if (mode === "save") {
            onSelectProject?.(project.id);
            // Deselect existing playground when switching projects
            onSelectExistingPlayground?.(null);
          }
        }}
      >
        <Icon name={expanded ? "vsc:folder-opened" : "vsc:folder"} className="shrink-0" />
        <span className="truncate">{project.name}</span>
      </button>

      {expanded && (
        <div className="ml-4 flex flex-col">
          {project.playgrounds.map((pg) => {
            const isSelectedPg =
              mode === "open"
                ? selectedFilename === pg.filename
                : selectedPlaygroundId === pg.id;

            return (
              <button
                key={pg.id}
                type="button"
                className={cn(
                  "flex items-center gap-1 w-full px-1 py-0.5 rounded text-left hover:bg-accent",
                  isSelectedPg && "bg-accent",
                )}
                onClick={() => {
                  if (mode === "open") {
                    onSelectPlayground?.(pg);
                  } else {
                    onSelectExistingPlayground?.(pg);
                  }
                }}
              >
                {/* Use the cliff-notes SVG for .cliff-notes files */}
                <img
                  src="/images/cliff-notes.svg"
                  alt=""
                  className="w-4 h-4 shrink-0"
                />
                <span className="truncate">{pg.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

## Phase 2: Data-Fetching Hook

Create **`apps/web/src/lib/use-gist-tree.ts`**:

```ts
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { parseGistTree, type GistProject } from "./gist-format";
import { getGistPat } from "./gist-config";

interface UseGistTreeResult {
  projects: GistProject[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useGistTree(gistId: string | null): UseGistTreeResult {
  const [projects, setProjects] = useState<GistProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!gistId) return;
    setLoading(true);
    setError(null);
    try {
      const pat = getGistPat();
      const gist = await api.getGist(gistId, pat);
      setProjects(parseGistTree(gist.files));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load Gist";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [gistId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { projects, loading, error, refresh: fetch };
}
```

---

## Phase 3: Wire Fetching into GistExplorer

Refactor `GistExplorer` to optionally accept a `gistId` prop for self-fetching
(used by modals), or accept pre-fetched `projects` + `loading` + `error` + `onRefresh`
for use in tests.

```tsx
// GistExplorer.tsx — updated props

export interface GistExplorerProps {
  mode: GistExplorerMode;
  gistId?: string | null;       // if provided, self-fetches via useGistTree

  // OR pass pre-fetched data (for testing / Storybook)
  projects?: GistProject[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;

  // ... rest of props unchanged
}

// Inside GistExplorer:
const hook = useGistTree(props.gistId ?? null);
const projects = props.projects ?? hook.projects;
const loading  = props.loading  ?? hook.loading;
const error    = props.error    ?? hook.error;
const refresh  = props.onRefresh ?? hook.refresh;
```

---

## Verification Checklist

- [ ] `GistExplorer` renders the tree given static fixture data with no API calls
- [ ] Closed folder shows `vsc:folder`; open folder shows `vsc:folder-opened`
- [ ] `.cliff-notes` files show the cliff-notes SVG icon
- [ ] New project input accepts Enter and Escape
- [ ] File name input visible only in save mode with a project selected
- [ ] `useGistTree` fetches on mount and on `refresh()`
- [ ] `useGistTree` surfaces error message on API failure
