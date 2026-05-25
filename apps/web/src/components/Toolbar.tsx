import { useState } from "react";
import { IconButton } from "./ui/IconButton";
import { buildShareUrl, type PersistedState } from "@/lib/storage";
import { downloadPlayground } from "@/lib/playground-file";
import { siteConfig } from "@/lib/site-config";
import { ShareModal } from "./ShareModal";
import { LoadPlaygroundModal } from "./LoadPlaygroundModal";
import type { RenderOptionsState } from "./OptionsPane";

interface Props {
  onReset: () => void;
  onLoad: (state: PersistedState) => void;
  cliffToml: string;
  commits: unknown[];
  tags: unknown[];
  options: RenderOptionsState;
}

export function Toolbar({ onReset, onLoad, cliffToml, commits, tags, options }: Props) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);

  const shareUrl = showShareModal
    ? buildShareUrl(
        { cliffToml, commits, tags, options },
        window.location.origin,
        window.location.pathname,
      )
    : null;

  const handleSave = () => {
    downloadPlayground({ cliffToml, commits, tags, options });
  };

  const navLinkClass =
    "inline-flex items-center justify-center w-7 h-7 rounded text-muted-fg hover:text-fg transition-colors";

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">
              <span className="text-accent">cliff</span>-notes
            </span>
            <span className="text-xs text-muted-fg hidden sm:inline">
              a playground for git-cliff
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <a
              href={siteConfig.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub Repository"
              aria-label="GitHub Repository"
              className={navLinkClass}
            >
              <i className="bi bi-git" aria-hidden="true" />
            </a>
            <a
              href={siteConfig.issuesUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Report an Issue"
              aria-label="Report an Issue"
              className={navLinkClass}
            >
              <i className="bi bi-github" aria-hidden="true" />
            </a>
            <a
              href={siteConfig.sponsorUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub Sponsor"
              aria-label="GitHub Sponsor"
              className="inline-flex items-center justify-center w-7 h-7 rounded transition-colors hover:opacity-80"
              style={{ color: siteConfig.sponsorColor }}
            >
              <i className="bi bi-heart-fill" aria-hidden="true" />
            </a>
            <a
              href={siteConfig.coffeeUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Buy Me a Coffee"
              aria-label="Buy Me a Coffee"
              className={navLinkClass}
            >
              <i className="bi bi-cup-hot-fill" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <IconButton icon="arrow-clockwise" label="Reset to defaults" onClick={onReset} />
          <span className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />
          <IconButton
            icon="file-earmark-arrow-up-fill"
            label="Load Playground"
            onClick={() => setShowLoadModal(true)}
          />
          <IconButton icon="download" label="Save Playground" onClick={handleSave} />
          <span className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />
          <IconButton icon="share-fill" label="Share URL" onClick={() => setShowShareModal(true)} />
        </div>
      </header>

      {showLoadModal && (
        <LoadPlaygroundModal onClose={() => setShowLoadModal(false)} onLoad={onLoad} />
      )}
      {showShareModal && shareUrl && (
        <ShareModal
          url={shareUrl}
          cliffToml={cliffToml}
          onSave={handleSave}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}
