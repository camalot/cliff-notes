import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { toast } from "@/lib/toast";
import { cliffTomlContainsSecret } from "@/lib/monaco-cliff-toml";
import { buildShareUrl, type PersistedState } from "@/lib/storage";
import { Icon } from "./ui/Icon";

interface Props {
  state: PersistedState;
  cliffToml: string;
  onSave: () => void;
  onClose: () => void;
}

export function ShareModal({ state, cliffToml, onSave, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const hasSecret = useMemo(() => cliffTomlContainsSecret(cliffToml), [cliffToml]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Build the share URL asynchronously on first render.
  useEffect(() => {
    void buildShareUrl(state, window.location.origin, window.location.pathname).then(setUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyAndClose = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may not be available */
    }
    toast.success("Link copied", { message: "Share link has been copied to your clipboard." });
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
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-base font-semibold text-fg">Share this playground</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-fg hover:text-fg transition-colors ml-4"
            aria-label="Close"
          >
            <Icon name="bi:x-lg" aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-muted-fg mb-3">
          Share this link with others to let them open your exact setup — including your cliff.toml
          configuration, commits, tags, and options.
        </p>
        <p className="text-xs text-muted-fg mb-4">
          Your configuration is stored only in this browser; nothing is uploaded to a server. The
          share link encodes your full configuration in the URL, so anyone with the link can read
          it.
        </p>
        {hasSecret && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger bg-danger/10 px-3 py-2 mb-4 text-xs text-danger"
          >
            <Icon name="bi:exclamation-octagon-fill" className="mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold uppercase tracking-wide">Danger — secret detected</div>
              <p className="mt-1 text-danger/90">
                Your cliff.toml contains a <code className="font-mono">token</code> field. The share
                link below embeds your full configuration, so anyone with the link will be able to
                read this secret. Remove it before sharing.
              </p>
            </div>
          </div>
        )}
        {url === null ? (
          <div className="w-full h-9 bg-muted/40 border border-border rounded px-3 py-2 mb-5 animate-pulse" />
        ) : (
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full text-xs font-mono bg-muted/40 border border-border rounded px-3 py-2 mb-5 text-muted-fg focus:outline-none focus:ring-2 focus:ring-border"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" size="sm" onClick={onSave}>
            <Icon name="bi:download" aria-hidden="true" />
            Save
          </Button>
          <Button
            variant={hasSecret ? "danger" : "primary"}
            size="sm"
            onClick={() => void copyAndClose()}
            disabled={url === null}
          >
            <Icon name={hasSecret ? "bi:exclamation-octagon-fill" : "bi:share"} aria-hidden="true" />
            Copy Share Link
          </Button>
        </div>
      </div>
    </div>
  );
}
