import { useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Icon } from "./ui/Icon";
import { IntegrityError } from "@/lib/integrity";
import type { PersistedState } from "@/lib/storage";

interface Props {
  error: IntegrityError;
  recoveredState?: PersistedState;
  onClose: () => void;
  onLoadAnyway?: (state: PersistedState) => void;
}

const TITLES: Record<string, string> = {
  "hash-mismatch": "Integrity check failed",
  "unsupported-version": "Unsupported format version",
  "missing-field": "Incomplete file",
  "legacy-format": "Legacy format not supported",
};

const DESCRIPTIONS: Record<string, string> = {
  "hash-mismatch":
    "The data in this file or link has been modified since it was created. The computed checksum does not match the stored one.",
  "unsupported-version":
    "This file was created with a newer version of cliff-notes that this instance does not support.",
  "missing-field":
    "One or more required metadata fields are missing. The file may be incomplete or corrupt.",
  "legacy-format":
    "This link uses the old share format which is no longer supported. Ask the author to regenerate a share link.",
};

export function IntegrityErrorModal({ error, recoveredState, onClose, onLoadAnyway }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const canLoadAnyway = Boolean(recoveredState && onLoadAnyway);
  const showHashes = error.cause === "hash-mismatch" && error.expected && error.actual;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleLoadAnyway = () => {
    if (recoveredState && onLoadAnyway) {
      onLoadAnyway(recoveredState);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="bs:shield-exclamation" className="text-danger text-lg" aria-hidden="true" />
            <h2 className="text-base font-semibold text-fg">
              {TITLES[error.cause] ?? "Integrity error"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-fg hover:text-fg transition-colors ml-4"
            aria-label="Close"
          >
            <Icon name="bs:x-lg" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-muted-fg mb-4">
          {DESCRIPTIONS[error.cause] ?? error.message}
        </p>

        {showHashes && (
          <div className="space-y-2 mb-4">
            <div>
              <p className="text-xs font-medium text-muted-fg mb-1">Expected hash</p>
              <code className="block text-xs font-mono bg-muted/40 border border-border rounded px-2 py-1.5 text-fg break-all select-all">
                {error.expected}
              </code>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-fg mb-1">Actual hash (from input)</p>
              <code className="block text-xs font-mono bg-danger/10 border border-danger/40 rounded px-2 py-1.5 text-danger break-all select-all">
                {error.actual}
              </code>
            </div>
          </div>
        )}

        {canLoadAnyway && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 mb-4 text-xs text-yellow-400"
          >
            <Icon name="bs:exclamation-triangle-fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Loading this playground will mark it as <strong>untrusted</strong> until you make
              changes. A warning banner will be shown.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {canLoadAnyway && (
            <Button variant="secondary" size="sm" onClick={handleLoadAnyway}>
              <Icon name="bs:exclamation-triangle-fill" aria-hidden="true" />
              Load anyway (untrusted)
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
