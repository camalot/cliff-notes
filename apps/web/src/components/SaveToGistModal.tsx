import { useState, useEffect } from "react";
import { useAppStore } from "../store";
import { api, ApiError } from "../lib/api";
import {
  getGistId,
  setGistId,
  clearGistId,
  getGistPat,
  setGistPat,
  getSavePat,
  setSavePat,
  getGistProjectId,
  setGistProjectId,
  clearGistProjectId,
} from "../lib/gist-config";
import {
  buildGistSaveFiles,
  generatePlaygroundId,
  parseGistTree,
  projectMetadataFilename,
  playgroundFilename,
  playgroundMetadataFilename,
  type GistPlayground,
  type GistProject,
} from "../lib/gist-format";
import { serializePlayground } from "../lib/playground-file";
import { GistExplorer } from "./GistExplorer";
import { GistPatSection } from "./GistPatSection";
import { Button } from "./ui/button";
import { Toggle } from "./ui/Toggle";
import { Icon } from "./ui/Icon";
import { toast } from "../lib/toast";

interface SaveToGistModalProps {
  onClose: () => void;
}

export function SaveToGistModal({ onClose }: SaveToGistModalProps) {
  const { cliffToml, commits, tags, options, name, playgroundId, user, authEnabled, setLoginModalOpen } = useAppStore();
  const setPlaygroundId = useAppStore((s) => s.setPlaygroundId);

  // ── PAT state ──────────────────────────────────────────────────────────────
  const [pat, setPat] = useState(getGistPat() ?? "");
  const [savePat, setSavePatState] = useState(getSavePat());

  // ── Gist ID (reactive so 404 clearing propagates to UI) ───────────────────
  const [localGistId, setLocalGistId] = useState<string | null>(getGistId);

  const effectivePat = pat.trim() || null;

  // ── Explorer state ─────────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    getGistProjectId(),
  );
  const [selectedExisting, setSelectedExisting] = useState<GistPlayground | null>(null);
  const [projects, setProjects] = useState<GistProject[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  // ── Save state ─────────────────────────────────────────────────────────────
  const defaultFileName = `${(name || "untitled-playground").toLowerCase().replace(/\s+/g, "-")}.cliff-notes`;
  const [fileName, setFileName] = useState(defaultFileName);
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Load tree ──────────────────────────────────────────────────────────────

  async function refreshProjects(gistId: string, pat: string | null) {
    setExplorerLoading(true);
    setExplorerError(null);
    try {
      const gist = await api.getGist(gistId, pat);
      setProjects(parseGistTree(gist.files));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        clearGistId();
        clearGistProjectId();
        setLocalGistId(null);
        setSelectedProjectId(null);
        setProjects([]);
      } else {
        setExplorerError(err instanceof Error ? err.message : "Failed to load Gist");
      }
    } finally {
      setExplorerLoading(false);
    }
  }

  // Auto-load on mount only when auth is available (logged in or stored PAT)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const storedId = getGistId();
    const storedPat = (getGistPat() ?? "").trim() || null;
    if (storedId && (user || storedPat)) {
      void refreshProjects(storedId, storedPat);
    }
  }, []);

  // Sync fileName when user selects an existing playground to overwrite
  useEffect(() => {
    if (selectedExisting) {
      setFileName(`${selectedExisting.name}.cliff-notes`);
    }
  }, [selectedExisting?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create project handler ─────────────────────────────────────────────────

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

  // ── Delete handlers ────────────────────────────────────────────────────────

  async function handleDeletePlayground(project: GistProject, pg: GistPlayground) {
    const gistId = localGistId;
    if (!gistId) return;
    const files: Record<string, null> = {
      [playgroundFilename(project.id, pg.id)]: null,
      [playgroundMetadataFilename(project.id, pg.id)]: null,
    };
    await api.updateGist(gistId, files, effectivePat);
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? { ...p, playgrounds: p.playgrounds.filter((x) => x.id !== pg.id) }
          : p,
      ),
    );
    if (selectedExisting?.id === pg.id) {
      setSelectedExisting(null);
      setFileName(defaultFileName);
    }
    toast.success("Playground deleted");
  }

  async function handleDeleteProject(project: GistProject) {
    const gistId = localGistId;
    if (!gistId) return;
    const files: Record<string, null> = {
      [projectMetadataFilename(project.id)]: null,
    };
    for (const pg of project.playgrounds) {
      files[playgroundFilename(project.id, pg.id)] = null;
      files[playgroundMetadataFilename(project.id, pg.id)] = null;
    }
    await api.updateGist(gistId, files, effectivePat);
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    if (selectedProjectId === project.id) {
      setSelectedProjectId(null);
      setSelectedExisting(null);
      setFileName(defaultFileName);
    }
    toast.success("Project deleted");
  }

  // ── Save handler ───────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedProjectId) {
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
        setSavePat(false); // also clears stored PAT
      }

      // Use existing playground ID when overwriting, otherwise generate a new one
      const pId = selectedExisting?.id ?? playgroundId ?? generatePlaygroundId();
      const project = projects.find((p) => p.id === selectedProjectId);
      const effectiveFileName = fileName.trim() || defaultFileName;
      const playgroundName = effectiveFileName.replace(/\.cliff-notes$/, "");

      const content = await serializePlayground({
        cliffToml,
        commits,
        tags,
        options,
        name,
        playgroundId: pId,
      });

      const existingPlayground = selectedExisting ?? project?.playgrounds.find((pg) => pg.id === pId);

      const files = buildGistSaveFiles({
        projectId: selectedProjectId,
        projectName: project?.name ?? "Untitled Project",
        projectDescription: project?.description,
        playgroundId: pId,
        playgroundName,
        playgroundContent: content,
        existingProjectCreatedAt: project?.createdAt,
        existingPlaygroundCreatedAt: existingPlayground?.createdAt,
      });

      let activeGistId = localGistId;

      if (!activeGistId) {
        const gist = await api.createGist({
          description: "cliff-notes.dev playground",
          isPublic,
          files,
          pat: effectivePat,
        });
        activeGistId = gist.id;
        setGistId(activeGistId);
        setLocalGistId(activeGistId);
      } else {
        await api.updateGist(activeGistId, files, effectivePat);
      }

      setPlaygroundId(pId);
      setGistProjectId(selectedProjectId);

      toast.success("Saved to GitHub Gist");
      onClose();
    } catch (err) {
      toast.error("Failed to save to Gist", {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <h2 className="text-base font-semibold text-fg flex items-center gap-2">
            <Icon name="vsc:github-inverted" aria-hidden="true" />
            Save to GitHub Gist
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-fg hover:text-fg transition-colors ml-4"
            aria-label="Close"
          >
            <Icon name="bs:x-lg" aria-hidden="true" />
          </button>
        </div>

        {/* PAT section — shown when not OAuth-authed */}
        {!user && (
          <GistPatSection
            pat={pat}
            onPatChange={setPat}
            savePat={savePat}
            onSavePatChange={setSavePatState}
            onLogin={authEnabled ? () => setLoginModalOpen(true) : undefined}
          />
        )}

        {/* File explorer */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">Project</label>
            {localGistId && (
              <button
                type="button"
                className="text-xs text-muted-fg hover:text-fg transition-colors"
                onClick={() => void refreshProjects(localGistId, effectivePat)}
              >
                <Icon name="bi:refresh" aria-hidden="true" />
              </button>
            )}
          </div>
          {!localGistId && projects.length === 0 && (
            <p className="text-xs text-muted-fg mb-1">
              No Gist configured yet. Create a project below — a new Gist will be
              created on first save.
            </p>
          )}
          <GistExplorer
            mode="save"
            projects={projects}
            loading={explorerLoading}
            error={explorerError}
            onRefresh={() => localGistId && void refreshProjects(localGistId, effectivePat)}
            selectedProjectId={selectedProjectId}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              setSelectedExisting(null);
              setFileName(defaultFileName);
            }}
            selectedPlaygroundId={selectedExisting?.id ?? null}
            onSelectExistingPlayground={setSelectedExisting}
            onCreateProject={handleCreateProject}
            fileName={fileName}
            onFileNameChange={setFileName}
            onDeleteProject={handleDeleteProject}
            onDeletePlayground={handleDeletePlayground}
          />
        </div>

        {/* Privacy toggle — only on first-ever save */}
        {!localGistId && (
          <Toggle
            label="Make gist public"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            <Icon name="bs:x-lg" aria-hidden="true" />
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || !selectedProjectId}
          >
            <Icon name="vsc:github-inverted" aria-hidden="true" />
            {saving ? "Saving…" : "Save to GitHub Gist"}
          </Button>
        </div>
      </div>
    </div>
  );
}
