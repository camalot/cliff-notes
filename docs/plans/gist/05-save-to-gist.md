# Unit 5 — Save to Gist

Split button replacing the current Save Playground button, plus the
SaveToGistModal dialog.

**Depends on:** Units 1–4
**Required by:** nothing (end-user feature)

---

## Phase 1: `SplitButton` UI Primitive

Create **`apps/web/src/components/ui/SplitButton.tsx`**:

```tsx
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export interface SplitButtonAction {
  key: string;
  label: string;
  icon: string;
}

interface SplitButtonProps {
  actions: SplitButtonAction[];
  activeKey: string;
  onAction: (key: string) => void;
  onChangeActiveKey: (key: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SplitButton({
  actions,
  activeKey,
  onAction,
  onChangeActiveKey,
  disabled,
  className,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = actions.find((a) => a.key === activeKey) ?? actions[0]!;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative flex", className)}>
      {/* Main action button */}
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium",
          "bg-secondary text-secondary-foreground",
          "border border-border border-r-0",
          "rounded-l-md",
          "hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        onClick={() => onAction(active.key)}
      >
        <Icon name={active.icon} />
        <span>{active.label}</span>
      </button>

      {/* Chevron dropdown trigger */}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center px-1.5 py-1",
          "bg-secondary text-secondary-foreground",
          "border border-border",
          "rounded-r-md",
          "hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="vsc:chevron-down" className="w-3 h-3" />
      </button>

      {/* Dropdown menu */}
      {open && (
        <ul
          role="listbox"
          className={cn(
            "absolute right-0 top-full mt-1 z-50 min-w-36",
            "bg-popover border border-border rounded-md shadow-lg py-1",
          )}
        >
          {actions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                role="option"
                aria-selected={action.key === activeKey}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left",
                  "hover:bg-accent",
                  action.key === activeKey && "bg-accent/50",
                )}
                onClick={() => {
                  onChangeActiveKey(action.key);
                  onAction(action.key);
                  setOpen(false);
                }}
              >
                <Icon name={action.icon} />
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

---

## Phase 2: Wire Split Button into Toolbar

**File:** `apps/web/src/components/Toolbar.tsx`

### Imports to add:

```ts
import { SplitButton } from "./ui/SplitButton";
import { getLastSaveAction, setLastSaveAction, type SaveAction } from "../lib/gist-config";
```

### State to add:

```ts
const [showSaveToGistModal, setShowSaveToGistModal] = useState(false);
const [saveAction, setSaveAction] = useState<SaveAction>(getLastSaveAction);
```

### Replace the existing Save Playground `IconButton`:

```diff
- <IconButton
-   icon="vsc:save"
-   label="Save Playground"
-   title="Save Playground"
-   onClick={() => downloadPlayground({ cliffToml, commits, tags, options, name })}
- />
+ <SplitButton
+   actions={[
+     { key: "local", label: "Save Locally",          icon: "vsc:save" },
+     { key: "gist",  label: "Save to GitHub Gist",   icon: "vsc:github-inverted" },
+   ]}
+   activeKey={saveAction}
+   onAction={(key) => {
+     if (key === "local") {
+       void downloadPlayground({ cliffToml, commits, tags, options, name });
+     } else {
+       setShowSaveToGistModal(true);
+     }
+   }}
+   onChangeActiveKey={(key) => {
+     const action = key as SaveAction;
+     setSaveAction(action);
+     setLastSaveAction(action);
+   }}
+ />
```

### Add modal render (alongside the other modals):

```tsx
{showSaveToGistModal && (
  <SaveToGistModal onClose={() => setShowSaveToGistModal(false)} />
)}
```

---

## Phase 3: `SaveToGistModal`

Create **`apps/web/src/components/SaveToGistModal.tsx`**:

### Sections:

1. **PAT row** — shown when no OAuth session (`!user`) or always as an override
2. **GistExplorer** — tree for selecting project + optional existing playground
3. **Filename input** — pre-filled with `<playground-name>.cliff-notes`
4. **Privacy toggle** — only shown when no `gistId` is set yet (first-time creation)
5. **Buttons** — Cancel, Save to Gist

```tsx
import { useState } from "react";
import { useAppStore } from "../store";
import { api } from "../lib/api";
import {
  getGistId, setGistId,
  getGistPat, setGistPat, clearGistPat,
  getSavePat, setSavePat,
} from "../lib/gist-config";
import {
  buildGistSaveFiles,
  generatePlaygroundId,
  type GistPlayground,
  type GistProject,
} from "../lib/gist-format";
import { serializePlayground } from "../lib/playground-file";
import { GistExplorer } from "./GistExplorer";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Toggle } from "./ui/Toggle";
import { toast } from "../lib/toast";

interface SaveToGistModalProps {
  onClose: () => void;
}

export function SaveToGistModal({ onClose }: SaveToGistModalProps) {
  const { cliffToml, commits, tags, options, name, playgroundId, user } = useAppStore();
  const setPlaygroundId = useAppStore((s) => s.setPlaygroundId);
  const setGistProjectId = useAppStore((s) => s.setGistProjectId);

  // ── PAT state ────────────────────────────────────────────────────────────
  const [pat, setPat] = useState(getGistPat() ?? "");
  const [savePat, setSavePatState] = useState(getSavePat());

  // ── Gist ID state ────────────────────────────────────────────────────────
  const existingGistId = getGistId();

  // ── Explorer state ───────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedExisting, setSelectedExisting] = useState<GistPlayground | null>(null);
  const [projects, setProjects] = useState<GistProject[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  // ── Save state ───────────────────────────────────────────────────────────
  const defaultFileName = `${(name || "untitled-playground").toLowerCase().replace(/\s+/g, "-")}.cliff-notes`;
  const [fileName, setFileName] = useState(
    selectedExisting
      ? `${selectedExisting.name.toLowerCase().replace(/\s+/g, "-")}.cliff-notes`
      : defaultFileName,
  );
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  // Use PAT from input or fall back to OAuth session (server handles it)
  const effectivePat = pat.trim() || null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function refreshProjects() {
    const gistId = existingGistId;
    if (!gistId) return;
    setExplorerLoading(true);
    setExplorerError(null);
    try {
      const gist = await api.getGist(gistId, effectivePat);
      const { parseGistTree } = await import("../lib/gist-format");
      setProjects(parseGistTree(gist.files));
    } catch (err) {
      setExplorerError(err instanceof Error ? err.message : "Failed to load Gist");
    } finally {
      setExplorerLoading(false);
    }
  }

  // ── Save handler ─────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedProjectId && !projects.some((p) => p.id === selectedProjectId)) {
      toast.error("Select or create a project first.");
      return;
    }

    setSaving(true);
    try {
      // Persist PAT preference
      if (savePat && effectivePat) {
        setGistPat(effectivePat);
        setSavePat(true);
      } else if (!savePat) {
        setSavePat(false); // clears stored PAT
      }

      // Resolve IDs
      const pId = playgroundId ?? generatePlaygroundId();
      const projectId = selectedProjectId!;
      const playgroundName = fileName.replace(/\.cliff-notes$/, "");

      // Find selected project metadata
      const project = projects.find((p) => p.id === projectId);
      const existingPlayground = selectedExisting;

      // Serialize the playground content
      const content = await serializePlayground({
        cliffToml, commits, tags, options, name, playgroundId: pId,
      });

      // Build the file map
      const files = buildGistSaveFiles({
        projectId,
        projectName: project?.name ?? "Untitled Project",
        projectDescription: project?.description,
        playgroundId: pId,
        playgroundName,
        playgroundContent: content,
        existingProjectCreatedAt: project?.createdAt,
        existingPlaygroundCreatedAt: existingPlayground?.createdAt,
      });

      let gistId = existingGistId;

      if (!gistId) {
        // First save — create a new gist
        const gist = await api.createGist({
          description: "cliff-notes.dev playground",
          isPublic,
          files,
          pat: effectivePat,
        });
        gistId = gist.id;
        setGistId(gistId);
      } else {
        // Update existing gist
        await api.updateGist(gistId, files, effectivePat);
      }

      // Persist playgroundId into state so it's stable on future saves
      setPlaygroundId(pId);
      setGistProjectId(projectId);

      toast.success("Saved to GitHub Gist");
      onClose();
    } catch (err) {
      toast.error(
        "Failed to save to Gist",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Create project handler ────────────────────────────────────────────────

  function handleCreateProject(projectName: string) {
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    const newProject: GistProject = {
      id: newId,
      name: projectName,
      description: "",
      createdAt: now,
      updatedAt: now,
      playgrounds: [],
    };
    setProjects((prev) => [...prev, newProject]);
    setSelectedProjectId(newId);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Icon name="vsc:github-inverted" />
          Save to GitHub Gist
        </h2>

        {/* PAT section — shown when not OAuth-authed */}
        {!user && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Personal Access Token</label>
            <Input
              type="password"
              placeholder="ghp_…"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Needs the <code>gist</code> scope.{" "}
              <a
                href="https://github.com/settings/tokens/new?scopes=gist"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Create one
              </a>
            </p>
            <Toggle
              id="save-pat-toggle"
              label="Save token in browser"
              checked={savePat}
              onChange={(checked) => setSavePatState(checked)}
            />
          </div>
        )}

        {/* File explorer */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Project</label>
            {existingGistId && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={refreshProjects}
              >
                Refresh
              </button>
            )}
          </div>
          <GistExplorer
            mode="save"
            projects={projects}
            loading={explorerLoading}
            error={explorerError}
            onRefresh={refreshProjects}
            selectedProjectId={selectedProjectId}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              setSelectedExisting(null);
            }}
            selectedPlaygroundId={selectedExisting?.id ?? null}
            onSelectExistingPlayground={setSelectedExisting}
            onCreateProject={handleCreateProject}
            fileName={fileName}
            onFileNameChange={setFileName}
          />
        </div>

        {/* Privacy toggle (only on first-ever save, no existing gistId) */}
        {!existingGistId && (
          <Toggle
            id="gist-public-toggle"
            label="Make gist public"
            checked={isPublic}
            onChange={setIsPublic}
          />
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || !selectedProjectId}
          >
            {saving ? "Saving…" : "Save to Gist"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## Verification Checklist

- [ ] Split button renders with "Save Locally" as default action
- [ ] Clicking the main button area triggers the active action without opening the dropdown
- [ ] Clicking the chevron opens the dropdown; clicking outside closes it
- [ ] Selecting "Save to GitHub Gist" from dropdown updates the active action (persisted to localStorage)
- [ ] Next click of main button goes directly to Gist modal
- [ ] `SaveToGistModal` shows PAT field only when `user` is null
- [ ] Saving creates a Gist when none exists, stores the returned `gistId`
- [ ] Saving updates an existing Gist when `gistId` already saved
- [ ] `playgroundId` is generated on first save and persisted into state
- [ ] Toast shows success on save, error with message on failure
- [ ] Privacy toggle only appears when no existing Gist is configured
