import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Toggle } from "./ui/Toggle";
import { toast } from "@/lib/toast";
import { useAppStore } from "../store";
import {
  parsePlayground,
  tryRecoverFromFile,
  tryRecoverFromUrlInput,
  decodeAndVerifyUrlInput,
} from "@/lib/playground-file";
import { IntegrityError } from "@/lib/integrity";
import type { PersistedState } from "@/lib/storage";
import { Icon } from "./ui/Icon";
import { GistExplorer } from "./GistExplorer";
import { GistPatSection } from "./GistPatSection";
import {
  getGistId,
  setGistId,
  clearGistId,
  clearGistProjectId,
  getGistPat,
  setGistPat,
  getSavePat,
  setSavePat,
} from "../lib/gist-config";
import { parseGistTree, type GistPlayground, type GistProject } from "../lib/gist-format";
import { api, ApiError } from "../lib/api";

type ModalView = "main" | "gist-configure" | "gist-explorer";

interface Props {
  onClose: () => void;
  onLoad: (state: PersistedState) => void;
  onIntegrityError: (error: IntegrityError, recoveredState?: PersistedState) => void;
}

export function LoadPlaygroundModal({ onClose, onLoad, onIntegrityError }: Props) {
  const { user, authEnabled, setLoginModalOpen } = useAppStore();
  const [view, setView] = useState<ModalView>("main");
  const [urlInput, setUrlInput] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedState, setParsedState] = useState<PersistedState | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  // ── Gist configure state ───────────────────────────────────────────────────
  const [gistIdInput, setGistIdInput] = useState(getGistId() ?? "");
  const [patInput, setPatInput] = useState(getGistPat() ?? "");
  const [savePatState, setSavePatState] = useState(getSavePat());

  // ── Gist explorer state ────────────────────────────────────────────────────
  const [gistProjects, setGistProjects] = useState<GistProject[]>([]);
  const [gistLoading, setGistLoading] = useState(false);
  const [gistError, setGistError] = useState<string | null>(null);
  const [selectedPlayground, setSelectedPlayground] = useState<GistPlayground | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleUrlChange = (value: string) => {
    setUrlInput(value);
    if (!value.trim()) {
      setParsedState(null);
      setFileError(null);
      return;
    }

    const seq = ++seqRef.current;

    void (async () => {
      try {
        const state = await decodeAndVerifyUrlInput(value);
        if (seq !== seqRef.current) return; // stale
        setParsedState(state);
        setFileError(null);
      } catch (err) {
        if (seq !== seqRef.current) return; // stale
        if (err instanceof IntegrityError) {
          setParsedState(null);
          setFileError(null);
          onClose();
          onIntegrityError(err, tryRecoverFromUrlInput(value) ?? undefined);
        } else {
          setParsedState(null);
          setFileError("Could not decode the pasted link.");
        }
      }
    })();
  };

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith(".cliff-notes")) {
      setFileError("Invalid cliff-notes file: wrong extension");
      setParsedState(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      void (async () => {
        try {
          const state = await parsePlayground(content);
          setParsedState(state);
          setFileError(null);
          setUrlInput("");
        } catch (err) {
          if (err instanceof IntegrityError) {
            setParsedState(null);
            setFileError(null);
            onClose();
            onIntegrityError(err, tryRecoverFromFile(content) ?? undefined);
          } else {
            setFileError("Invalid cliff-notes file: failed to parse");
            setParsedState(null);
          }
        }
      })();
    };
    reader.readAsText(file);
  }, [onClose, onIntegrityError]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleLoad = () => {
    if (!parsedState) return;
    onLoad(parsedState);
    toast.success("Playground loaded");
    onClose();
  };

  // ── Gist helpers ───────────────────────────────────────────────────────────

  async function fetchGistTree(gistId: string, pat: string | null) {
    setGistLoading(true);
    setGistError(null);
    try {
      const gist = await api.getGist(gistId, pat);
      setGistProjects(parseGistTree(gist.files));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        clearGistId();
        clearGistProjectId();
        setView("main");
        toast.error("GitHub Gist not found — it may have been deleted.");
      } else {
        setGistError(err instanceof Error ? err.message : "Failed to load Gist");
      }
    } finally {
      setGistLoading(false);
    }
  }

  async function openSelectedPlayground() {
    if (!selectedPlayground) return;
    setLoadingFile(true);
    let content = "";
    try {
      const gistId = getGistId()!;
      const pat = patInput.trim() || getGistPat() || null;

      if (selectedPlayground.truncated && selectedPlayground.rawUrl) {
        content = await api.getRawGistFile(selectedPlayground.rawUrl, pat);
      } else {
        const gist = await api.getGist(gistId, pat);
        const file = gist.files[selectedPlayground.filename];
        if (!file?.content) throw new Error("File content not available");
        content = file.content;
      }

      const state = await parsePlayground(content);
      onLoad(state);
      toast.success("Playground loaded");
      onClose();
    } catch (err) {
      if (err instanceof IntegrityError) {
        onClose();
        onIntegrityError(err, tryRecoverFromFile(content) ?? undefined);
      } else {
        toast.error("Failed to open playground", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      setLoadingFile(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-fg">Load Playground</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-fg hover:text-fg transition-colors ml-4"
            aria-label="Close"
          >
            <Icon name="bs:x-lg" aria-hidden="true" />
          </button>
        </div>

        <label className="block text-xs font-medium text-muted-fg mb-1">
          Paste a playground share link
        </label>
        <textarea
          className="w-full text-xs font-mono bg-muted/40 border border-border rounded px-3 py-2 mb-4 text-fg focus:outline-none focus:ring-2 focus:ring-border resize-none"
          rows={3}
          placeholder="https://cliff-notes.dev/#s=…&h=…&v=1"
          value={urlInput}
          onChange={(e) => handleUrlChange(e.target.value)}
        />

        <label className="block text-xs font-medium text-muted-fg mb-1">
          Upload a .cliff-notes file
        </label>
        <div
          className={[
            "border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors mb-4",
            isDragging ? "border-accent bg-accent/10" : "border-border hover:border-muted-fg",
            fileError ? "border-danger bg-danger/5" : "",
          ].join(" ")}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          aria-label="Upload .cliff-notes file"
        >
          <Icon name="bs:file-earmark-arrow-up" className="text-2xl text-muted-fg" aria-hidden="true" />
          <p className="text-xs text-muted-fg mt-2">
            Drop a <code className="font-mono">.cliff-notes</code> file here, or click to browse
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".cliff-notes"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {fileError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-danger bg-danger/10 px-3 py-2 mb-4 text-xs text-danger"
          >
            <Icon name="bs:exclamation-circle-fill" aria-hidden="true" />
            {fileError}
          </div>
        )}

        {parsedState && !fileError && (
          <div className="flex items-center gap-2 rounded-md border border-green-500 bg-green-500/10 px-3 py-2 mb-4 text-xs text-green-400">
            <Icon name="bs:check-circle-fill" aria-hidden="true" />
            Playground ready to load
          </div>
        )}

        {/* ── From GitHub Gist ────────────────────────────────────── */}
        {view === "main" && (
          <div className="pt-4 pb-4">
            <label className="block text-xs font-medium text-muted-fg mb-2">
              From GitHub Gist
            </label>
            {!user && !patInput.trim() ? (
              <GistPatSection
                pat={patInput}
                onPatChange={setPatInput}
                savePat={savePatState}
                onSavePatChange={setSavePatState}
                onLogin={authEnabled ? () => setLoginModalOpen(true) : undefined}
              />
            ) : (
              <div className="border-2 border-border rounded-lg px-4 py-6 text-center">
                {getGistId() ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const pat = patInput.trim() || null;
                      if (savePatState && pat) { setGistPat(pat); setSavePat(true); }
                      else if (!savePatState) { setSavePat(false); }
                      setView("gist-explorer");
                      void fetchGistTree(getGistId()!, pat || getGistPat());
                    }}
                  >
                    <Icon name="vsc:github-inverted" aria-hidden="true" />
                    Open from GitHub Gist
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setView("gist-configure")}>
                    Configure GitHub Gist…
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Gist configure view ─────────────────────────────────── */}
        {view === "gist-configure" && (
          <div className="border-t border-border pt-4 flex flex-col gap-4">
            <h3 className="text-sm font-semibold">Configure GitHub Gist</h3>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-fg">Gist ID</label>
              <Input
                placeholder="e.g. a1b2c3d4e5f6…"
                value={gistIdInput}
                onChange={(e) => setGistIdInput(e.target.value)}
                className="text-xs"
              />
              <p className="text-xs text-muted-fg">
                The ID from your Gist URL:{" "}
                <span className="font-mono">github.com/gist/&lt;login&gt;/<strong>&lt;gist-id&gt;</strong></span>
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-fg">Personal Access Token</label>
              <Input
                type="password"
                placeholder="ghp_…"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                autoComplete="off"
                className="text-xs"
              />
              <Toggle
                label="Save token in browser"
                checked={savePatState}
                onChange={(e) => setSavePatState(e.target.checked)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setView("main")}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
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

        {/* ── Gist explorer view ──────────────────────────────────── */}
        {view === "gist-explorer" && (
          <div className="border-t border-border pt-4 flex flex-col gap-4">
            <h3 className="text-sm font-semibold">Open from GitHub Gist</h3>

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
              <Button variant="secondary" size="sm" onClick={onClose}>
                <Icon name="bs:x-lg" aria-hidden="true" />
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedPlayground || loadingFile}
                onClick={() => void openSelectedPlayground()}
              >
                <Icon name="bs:file-earmark-arrow-up" aria-hidden="true" />
                {loadingFile ? "Opening…" : "Open Playground"}
              </Button>
            </div>
          </div>
        )}

        {/* Bottom action row — only in main view */}
        {view === "main" && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            <Icon name="bs:x-lg" aria-hidden="true" />
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleLoad} disabled={!parsedState}>
            <Icon name="bs:file-earmark-arrow-up" aria-hidden="true" />
            Load Playground
          </Button>
        </div>
        )}
      </div>
    </div>
  );
}
