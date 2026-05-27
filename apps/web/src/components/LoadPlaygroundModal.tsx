import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./ui/button";
import { toast } from "@/lib/toast";
import {
  parsePlayground,
  tryRecoverFromFile,
  tryRecoverFromUrlInput,
  decodeAndVerifyUrlInput,
} from "@/lib/playground-file";
import { IntegrityError } from "@/lib/integrity";
import type { PersistedState } from "@/lib/storage";
import { Icon } from "./ui/Icon";

interface Props {
  onClose: () => void;
  onLoad: (state: PersistedState) => void;
  onIntegrityError: (error: IntegrityError, recoveredState?: PersistedState) => void;
}

export function LoadPlaygroundModal({ onClose, onLoad, onIntegrityError }: Props) {
  const [urlInput, setUrlInput] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedState, setParsedState] = useState<PersistedState | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Monotonic counter for last-write-wins in async URL decode
  const seqRef = useRef(0);

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
            <Icon name="bi:x-lg" aria-hidden="true" />
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
          Or upload a .cliff-notes file
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
          <Icon name="bi:file-earmark-arrow-up" className="text-2xl text-muted-fg" aria-hidden="true" />
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
            <Icon name="bi:exclamation-circle-fill" aria-hidden="true" />
            {fileError}
          </div>
        )}

        {parsedState && !fileError && (
          <div className="flex items-center gap-2 rounded-md border border-green-500 bg-green-500/10 px-3 py-2 mb-4 text-xs text-green-400">
            <Icon name="bi:check-circle-fill" aria-hidden="true" />
            Playground ready to load
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleLoad} disabled={!parsedState}>
            <Icon name="bi:file-earmark-arrow-up-fill" aria-hidden="true" />
            Load Playground
          </Button>
        </div>
      </div>
    </div>
  );
}
