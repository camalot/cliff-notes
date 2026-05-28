# Unit 6 — Load from Gist

Adds a "From GitHub Gist" section to the existing `LoadPlaygroundModal` and
implements the Gist open flow using `GistExplorer`.

**Depends on:** Units 1–4
**Required by:** nothing (end-user feature)

---

## Phase 1: Modal View State

`LoadPlaygroundModal` currently has two load modes (share link, file drop).
Add a third view: **gist explorer**.

The modal renders one of three views based on local `view` state:
- `"main"` — existing load options + "Open from GitHub Gist" button
- `"gist-configure"` — PAT input + Gist ID input (when not yet configured)
- `"gist-explorer"` — GistExplorer in open mode

```ts
type ModalView = "main" | "gist-configure" | "gist-explorer";
```

---

## Phase 2: Changes to `LoadPlaygroundModal.tsx`

### Imports to add:

```ts
import { GistExplorer } from "./GistExplorer";
import {
  getGistId, setGistId,
  getGistPat, setGistPat,
  getSavePat, setSavePat,
} from "../lib/gist-config";
import { parseGistTree, type GistPlayground, type GistProject } from "../lib/gist-format";
import { api } from "../lib/api";
import { parsePlayground } from "../lib/playground-file";
import { toast } from "../lib/toast";
```

### State to add:

```ts
const [view, setView] = useState<ModalView>("main");

// Gist configure view
const [gistIdInput, setGistIdInput] = useState(getGistId() ?? "");
const [patInput, setPatInput] = useState(getGistPat() ?? "");
const [savePatState, setSavePatState] = useState(getSavePat());

// Gist explorer view
const [gistProjects, setGistProjects] = useState<GistProject[]>([]);
const [gistLoading, setGistLoading] = useState(false);
const [gistError, setGistError] = useState<string | null>(null);
const [selectedPlayground, setSelectedPlayground] = useState<GistPlayground | null>(null);
const [loadingFile, setLoadingFile] = useState(false);
```

### Helper: fetch gist tree

```ts
async function fetchGistTree(gistId: string, pat: string | null) {
  setGistLoading(true);
  setGistError(null);
  try {
    const gist = await api.getGist(gistId, pat);
    setGistProjects(parseGistTree(gist.files));
  } catch (err) {
    setGistError(err instanceof Error ? err.message : "Failed to load Gist");
  } finally {
    setGistLoading(false);
  }
}
```

### Helper: open selected playground

```ts
async function openSelectedPlayground() {
  if (!selectedPlayground) return;
  setLoadingFile(true);
  try {
    const gistId = getGistId()!;
    const pat = patInput.trim() || getGistPat() || null;

    let content: string;
    if (selectedPlayground.truncated && selectedPlayground.rawUrl) {
      content = await api.getRawGistFile(selectedPlayground.rawUrl, pat);
    } else {
      // Re-fetch the gist to get the file content (not truncated)
      const gist = await api.getGist(gistId, pat);
      const file = gist.files[selectedPlayground.filename];
      if (!file?.content) throw new Error("File content not available");
      content = file.content;
    }

    const state = await parsePlayground(content);
    onLoad(state);  // existing prop
  } catch (err) {
    toast.error(
      "Failed to open playground",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    setLoadingFile(false);
  }
}
```

### "From GitHub Gist" section in the `"main"` view

Add below the file drop zone:

```tsx
{/* ── From GitHub Gist ─────────────────────────────────────── */}
<div className="border-t border-border pt-4 flex flex-col items-center gap-3">
  <span className="text-sm text-muted-foreground">From GitHub Gist</span>

  {getGistId() ? (
    <Button
      variant="secondary"
      onClick={() => {
        setView("gist-explorer");
        void fetchGistTree(getGistId()!, getGistPat());
      }}
    >
      <Icon name="vsc:github-inverted" />
      Open from GitHub Gist
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setView("gist-configure")}
    >
      Configure GitHub Gist…
    </Button>
  )}
</div>
```

### `"gist-configure"` view

Replaces the modal body when `view === "gist-configure"`:

```tsx
{view === "gist-configure" && (
  <div className="flex flex-col gap-4">
    <h3 className="font-medium">Configure GitHub Gist</h3>

    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Gist ID</label>
      <Input
        placeholder="e.g. a1b2c3d4e5f6…"
        value={gistIdInput}
        onChange={(e) => setGistIdInput(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        The ID from your Gist URL: github.com/gist/&lt;your-login&gt;/<strong>&lt;gist-id&gt;</strong>
      </p>
    </div>

    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Personal Access Token</label>
      <Input
        type="password"
        placeholder="ghp_…"
        value={patInput}
        onChange={(e) => setPatInput(e.target.value)}
        autoComplete="off"
      />
      <Toggle
        id="load-save-pat-toggle"
        label="Save token in browser"
        checked={savePatState}
        onChange={(checked) => setSavePatState(checked)}
      />
    </div>

    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={() => setView("main")}>
        Back
      </Button>
      <Button
        variant="primary"
        disabled={!gistIdInput.trim()}
        onClick={() => {
          const id = gistIdInput.trim();
          const pat = patInput.trim() || null;
          setGistId(id);
          if (savePatState && pat) {
            setGistPat(pat);
            setSavePat(true);
          } else {
            setSavePat(false);
          }
          setView("gist-explorer");
          void fetchGistTree(id, pat);
        }}
      >
        Connect
      </Button>
    </div>
  </div>
)}
```

### `"gist-explorer"` view

Replaces the modal body when `view === "gist-explorer"`:

```tsx
{view === "gist-explorer" && (
  <div className="flex flex-col gap-4">
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="text-sm text-muted-foreground hover:underline"
        onClick={() => setView("main")}
      >
        ← Back
      </button>
      <h3 className="font-medium">Open from GitHub Gist</h3>
    </div>

    <GistExplorer
      mode="open"
      projects={gistProjects}
      loading={gistLoading}
      error={gistError}
      onRefresh={() => void fetchGistTree(getGistId()!, getGistPat())}
      selectedFilename={selectedPlayground?.filename ?? null}
      onSelectPlayground={setSelectedPlayground}
    />

    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={() => setView("main")}>
        Cancel
      </Button>
      <Button
        variant="primary"
        disabled={!selectedPlayground || loadingFile}
        onClick={openSelectedPlayground}
      >
        {loadingFile ? "Opening…" : "Open Playground"}
      </Button>
    </div>
  </div>
)}
```

### Handling `IntegrityError` on Gist open

`openSelectedPlayground` calls `parsePlayground()` which throws `IntegrityError`
if the file is tampered. This is caught in the `catch` block and displayed via
`toast.error`. If needed, the modal can call the existing `onIntegrityError` prop
to show the full `IntegrityErrorModal` (same path as the file drop zone).

Update `openSelectedPlayground` catch:

```ts
  } catch (err) {
    if (err instanceof IntegrityError) {
      onIntegrityError?.(err, () => {
        // "Load anyway" — recover without integrity check
        const recovered = tryRecoverFromFile(content ?? "");
        if (recovered) onLoad({ ...recovered, untrusted: true });
      });
    } else {
      toast.error("Failed to open playground", err instanceof Error ? err.message : String(err));
    }
  }
```

---

## Verification Checklist

- [ ] `LoadPlaygroundModal` shows "Open from GitHub Gist" button when `getGistId()` returns a value
- [ ] `LoadPlaygroundModal` shows "Configure GitHub Gist…" when no Gist ID is stored
- [ ] Configure view saves Gist ID and PAT to localStorage correctly
- [ ] Explorer view lists projects and playgrounds from the Gist
- [ ] Selecting a playground and clicking "Open" loads it into the editor
- [ ] Truncated files are fetched via `getRawGistFile` proxy
- [ ] Integrity error on load triggers the `IntegrityErrorModal` (not a silent failure)
- [ ] Back button returns to the main view without losing share-link or file-drop content
