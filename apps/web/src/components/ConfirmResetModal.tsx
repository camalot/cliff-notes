import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Toggle } from "./ui/Toggle";
import { Icon } from "./ui/Icon";

const LS_SKIP_KEY = "cliff-notes:skip-reset-confirm";

export function getSkipResetConfirm(): boolean {
  try {
    return localStorage.getItem(LS_SKIP_KEY) === "true";
  } catch {
    return false;
  }
}

interface Props {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  onSave?: () => Promise<void>;
}

export function ConfirmResetModal({ title, description, onConfirm, onCancel, onSave }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [skipNext, setSkipNext] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleConfirm = () => {
    if (skipNext) {
      try {
        localStorage.setItem(LS_SKIP_KEY, "true");
      } catch {
        /* ignore */
      }
    }
    onConfirm();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onCancel();
      }}
    >
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="bi:exclamation-triangle-fill" className="text-danger" aria-hidden="true" />
            <h2 className="text-base font-semibold text-fg">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-fg hover:text-fg transition-colors ml-4"
            aria-label="Close"
          >
            <Icon name="bi:x-lg" aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-muted-fg mb-4">{description}</p>
        <div className="mb-4">
          <Toggle
            label="Do not ask again"
            checked={skipNext}
            onChange={(e) => setSkipNext(e.target.checked)}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          {onSave ? (
            <Button variant="secondary" size="sm" onClick={() => void onSave()}>
              <Icon name="bi:download" aria-hidden="true" />
              Save Project
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              <Icon name="bi:x" aria-hidden="true" />
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirm}>
              <Icon name="vsc:discard" aria-hidden="true" />
              Reset
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
