import { useState } from "react";
import { IconButton } from "./ui/IconButton";
import { buildShareUrl } from "@/lib/storage";
import { ShareModal } from "./ShareModal";
import type { RenderOptionsState } from "./OptionsPane";

interface Props {
  onReset: () => void;
  cliffToml: string;
  commits: unknown[];
  tags: unknown[];
  options: RenderOptionsState;
}

export function Toolbar({ onReset, cliffToml, commits, tags, options }: Props) {
  const [showShareModal, setShowShareModal] = useState(false);

  const shareUrl = showShareModal
    ? buildShareUrl(
        { cliffToml, commits, tags, options },
        window.location.origin,
        window.location.pathname,
      )
    : null;

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">
            <span className="text-accent">cliff</span>-notes
          </span>
          <span className="text-xs text-muted-fg hidden sm:inline">
            a playground for git-cliff
          </span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton icon="arrow-clockwise" label="Reset to defaults" onClick={onReset} />
          <IconButton icon="share-fill" label="Share URL" onClick={() => setShowShareModal(true)} />
        </div>
      </header>
      {showShareModal && shareUrl && (
        <ShareModal
          url={shareUrl}
          cliffToml={cliffToml}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}
