import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./ui/Icon";
import { Button } from "./ui/button";
import { IconButton } from "./ui/IconButton";
import { Input } from "./ui/input";
import { ProgressBar } from "./ui/ProgressBar";
import { useGistTree } from "../lib/use-gist-tree";
import type { GistProject, GistPlayground } from "../lib/gist-format";

export type GistExplorerMode = "open" | "save";

export interface GistExplorerProps {
  mode: GistExplorerMode;
  /** If provided, self-fetches via useGistTree. */
  gistId?: string | null;

  /** Pre-fetched data (overrides gistId fetching when provided). */
  projects?: GistProject[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;

  // ── open mode ────────────────────────────────────────────────────────────
  /** Currently selected playground filename (open mode only). */
  selectedFilename?: string | null;
  onSelectPlayground?: (playground: GistPlayground) => void;

  // ── save mode ────────────────────────────────────────────────────────────
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

  // ── delete ───────────────────────────────────────────────────────────────
  onDeleteProject?: (project: GistProject) => Promise<void>;
  onDeletePlayground?: (project: GistProject, pg: GistPlayground) => Promise<void>;
}

export function GistExplorer(props: GistExplorerProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const hook = useGistTree(props.gistId ?? null);
  const projects = props.projects ?? hook.projects;
  const loading = props.loading ?? hook.loading;
  const error = props.error ?? hook.error;
  const refresh = props.onRefresh ?? hook.refresh;

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

  if (loading) {
    return (
      <div className="flex items-center gap-2 justify-center h-32 text-muted-fg text-sm">
        <ProgressBar active label="Loading Gist…" />
        <span>Loading Gist…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 p-4">
        <p className="text-sm text-danger">{error}</p>
        <Button variant="secondary" size="sm" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Tree */}
      <div className="border border-border rounded-md overflow-y-auto max-h-64 p-1 text-sm">
        {projects.length === 0 && (
          <p className="text-muted-fg text-xs p-2">No projects yet.</p>
        )}
        {projects.map((project) => (
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
            onDeleteProject={props.onDeleteProject}
            onDeletePlayground={props.onDeletePlayground}
            deletingItemId={deletingItemId}
            onSetDeletingItemId={setDeletingItemId}
          />
        ))}
      </div>

      {/* New project input (save mode only) */}
      {props.mode === "save" && (
        <div className="flex items-center gap-1 mt-1">
          {showNewProjectInput ? (
            <>
              <Input
                autoFocus
                className="flex-1 h-7 text-xs"
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
              <button
                type="button"
                onClick={() => {
                  if (newProjectName.trim()) {
                    props.onCreateProject?.(newProjectName.trim());
                  }
                  setShowNewProjectInput(false);
                  setNewProjectName("");
                }}
                className="flex items-center justify-center w-7 h-7 text-muted-fg hover:text-fg transition-colors"
                aria-label="Add project"
              >
                <Icon name="bs:plus-square-fill" size={16} />
              </button>
            </>
          ) : (
            <IconButton
              icon="bs:folder-plus"
              label="New project"
              onClick={() => setShowNewProjectInput(true)}
            />
          )}
        </div>
      )}

      {/* Filename input (save mode only) */}
      {props.mode === "save" && props.selectedProjectId && (
        <div className="flex flex-col gap-1 mt-2">
          <label className="text-xs text-muted-fg">File name</label>
          <Input
            value={props.fileName ?? ""}
            onChange={(e) => props.onFileNameChange?.(e.target.value)}
            placeholder="playground-name.cliff-notes"
            className="text-xs h-7"
          />
        </div>
      )}
    </div>
  );
}

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
  onDeleteProject,
  onDeletePlayground,
  deletingItemId,
  onSetDeletingItemId,
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
  onDeleteProject?: (project: GistProject) => Promise<void>;
  onDeletePlayground?: (project: GistProject, pg: GistPlayground) => Promise<void>;
  deletingItemId?: string | null;
  onSetDeletingItemId?: (id: string | null) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const isSelected = mode === "save" && selectedProjectId === project.id;
  const confirmDelete = deletingItemId === `project-${project.id}`;

  return (
    <div>
      <div className="group flex items-center w-full rounded">
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 flex-1 min-w-0 px-1 py-0.5 pb-1 rounded text-left text-fg hover:bg-muted/60",
            isSelected && "bg-accent text-accent-fg hover:bg-accent/90",
          )}
          onClick={() => {
            onToggle();
            if (mode === "save") {
              onSelectProject?.(project.id);
              onSelectExistingPlayground?.(null);
            }
          }}
        >
          <Icon
            name={expanded ? "vsc:folder-opened" : "vsc:folder"}
            className="shrink-0"
            size={14}
          />
          <span className="truncate text-xs">{project.name}</span>
        </button>

        {onDeleteProject && !confirmDelete && (
          <button
            type="button"
            className={cn(
              "p-1 transition-colors shrink-0",
              isSelected
                ? "text-danger opacity-100"
                : "opacity-0 group-hover:opacity-100 text-muted-fg hover:text-danger"
            )}
            onClick={(e) => { e.stopPropagation(); onSetDeletingItemId?.(`project-${project.id}`); }}
            aria-label="Delete project"
          >
            <Icon name="bs:trash" size={11} />
          </button>
        )}
        {confirmDelete && (
          <div className="flex items-center gap-1 px-1 shrink-0">
            <span className="text-xs text-danger">Delete?</span>
            <button
              type="button"
              className="text-danger hover:text-danger/80 disabled:opacity-50"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try { await onDeleteProject?.(project); }
                finally { setDeleting(false); onSetDeletingItemId?.(null); }
              }}
              aria-label="Confirm delete"
            >
              <Icon name="bs:check-lg" size={12} />
            </button>
            <button
              type="button"
              className="text-muted-fg hover:text-fg"
              onClick={() => onSetDeletingItemId?.(null)}
              aria-label="Cancel delete"
            >
              <Icon name="bs:x-lg" size={12} />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="ml-4 flex flex-col">
          {project.playgrounds.map((pg) => (
            <PlaygroundRow
              key={pg.id}
              project={project}
              pg={pg}
              mode={mode}
              isSelected={
                mode === "open"
                  ? selectedFilename === pg.filename
                  : selectedPlaygroundId === pg.id
              }
              onSelectPlayground={onSelectPlayground}
              onSelectExistingPlayground={onSelectExistingPlayground}
              onDeletePlayground={onDeletePlayground}
              deletingItemId={deletingItemId}
              onSetDeletingItemId={onSetDeletingItemId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaygroundRow({
  project,
  pg,
  mode,
  isSelected,
  onSelectPlayground,
  onSelectExistingPlayground,
  onDeletePlayground,
  deletingItemId,
  onSetDeletingItemId,
}: {
  project: GistProject;
  pg: GistPlayground;
  mode: GistExplorerMode;
  isSelected: boolean;
  onSelectPlayground?: (pg: GistPlayground) => void;
  onSelectExistingPlayground?: (pg: GistPlayground | null) => void;
  onDeletePlayground?: (project: GistProject, pg: GistPlayground) => Promise<void>;
  deletingItemId?: string | null;
  onSetDeletingItemId?: (id: string | null) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = deletingItemId === `playground-${pg.id}`;

  return (
    <div className="group flex items-center w-full rounded">
      <button
        type="button"
        className={cn(
          "flex items-center gap-1 flex-1 min-w-0 px-1 py-0.5 pb-1 rounded text-left text-fg hover:bg-muted/60",
          isSelected && "bg-accent text-accent-fg hover:bg-accent/90",
        )}
        onClick={() => {
          if (mode === "open") {
            onSelectPlayground?.(pg);
          } else {
            onSelectExistingPlayground?.(pg);
          }
        }}
      >
        <img
          src="/images/cliff-notes.svg"
          alt=""
          className="w-4 h-4 shrink-0"
        />
        <span className="truncate text-xs">{pg.name}</span>
      </button>

      {onDeletePlayground && !confirmDelete && (
        <button
          type="button"
          className={cn(
            "p-1 transition-colors shrink-0",
            isSelected
              ? "text-danger opacity-100"
              : "opacity-0 group-hover:opacity-100 text-muted-fg hover:text-danger"
          )}
          onClick={(e) => { e.stopPropagation(); onSetDeletingItemId?.(`playground-${pg.id}`); }}
          aria-label="Delete playground"
        >
          <Icon name="bs:trash" size={11} />
        </button>
      )}
      {confirmDelete && (
        <div className="flex items-center gap-1 px-1 shrink-0">
          <span className="text-xs text-danger">Delete?</span>
          <button
            type="button"
            className="text-danger hover:text-danger/80 disabled:opacity-50"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              try { await onDeletePlayground?.(project, pg); }
              finally { setDeleting(false); onSetDeletingItemId?.(null); }
            }}
            aria-label="Confirm delete"
          >
            <Icon name="bs:check-lg" size={12} />
          </button>
          <button
            type="button"
            className="text-muted-fg hover:text-fg"
            onClick={() => onSetDeletingItemId?.(null)}
            aria-label="Cancel delete"
          >
            <Icon name="bs:x-lg" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
