import { useState } from "react";
import { IconButton } from "./ui/IconButton";
import { SplitButton } from "./ui/SplitButton";
import { downloadPlayground } from "@/lib/playground-file";
import { siteConfig } from "@/lib/site-config";
import { ShareModal } from "./ShareModal";
import { LoadPlaygroundModal } from "./LoadPlaygroundModal";
import { SaveToGistModal } from "./SaveToGistModal";
import { PlaygroundName } from "./PlaygroundName";
import { ConfirmResetModal, getSkipResetConfirm } from "./ConfirmResetModal";
import { IntegrityError } from "@/lib/integrity";
import type { PersistedState } from "@/lib/storage";
import type { RenderOptionsState } from "./OptionsPane";
import { Icon } from "./ui/Icon";
import { UserMenu } from "./UserMenu";
import { LoginModal } from "./LoginModal";
import { useAppStore } from "@/store";
import { getLastSaveAction, setLastSaveAction, type SaveAction } from "../lib/gist-config";

interface Props {
  onReset: () => void | Promise<void>;
  onLoad: (state: PersistedState) => void;
  onIntegrityError: (error: IntegrityError, recoveredState?: PersistedState) => void;
  cliffToml: string;
  commits: unknown[];
  tags: unknown[];
  options: RenderOptionsState;
  name: string;
  onChangeName: (v: string) => void;
  onResetWithTemplate?: (templateId: string) => Promise<void>;
}

export function Toolbar({
  onReset,
  onLoad,
  onIntegrityError,
  cliffToml,
  commits,
  tags,
  options,
  name,
  onChangeName,
  onResetWithTemplate,
}: Props) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showSaveToGistModal, setShowSaveToGistModal] = useState(false);
  const [saveAction, setSaveAction] = useState<SaveAction>(getLastSaveAction);

  const { user, authLoading, authEnabled, loginModalOpen, setLoginModalOpen, logout } = useAppStore();

  const handleResetClick = () => {
    if (getSkipResetConfirm()) {
      void onReset();
    } else {
      setShowResetModal(true);
    }
  };

  const handleSave = async () => {
    await downloadPlayground({ cliffToml, commits, tags, options, name });
  };

  const navLinkClass =
    "inline-flex items-center justify-center w-7 h-7 rounded text-muted-fg hover:text-fg transition-colors";

  return (
    <>
      <header
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 border-b border-border bg-card"
        style={{ height: 52 }}
      >
        <div className="flex items-center gap-3 justify-self-start min-w-0">
          <img
            src="/images/cliff-notes.svg"
            alt="cliff-notes logo"
            width={48}
            height={48}
          />
          <div className="flex flex-col">
            <span className="text-lg font-semibold leading-tight">
              <span className="text-accent">cliff</span>-notes
            </span>
            <span className="text-xs text-muted-fg hidden sm:inline leading-tight">
              a playground for{" "}
              <a
                href="https://git-cliff.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent"
              >
                git-cliff
              </a>
            </span>
          </div>
          <span className="w-px self-stretch bg-border" aria-hidden="true" />
          <div className="flex items-center gap-0.5">
            <a
              href={siteConfig.repository.url}
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub Repository"
              aria-label="GitHub Repository"
              className={navLinkClass}
            >
              <Icon name={siteConfig.repository.icon} aria-hidden="true" />
            </a>
            <a
              href={siteConfig.issues.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Report an Issue"
              aria-label="Report an Issue"
              className={navLinkClass}
            >
              <Icon name={siteConfig.issues.icon} aria-hidden="true" />
            </a>
            <a
              href={siteConfig.sponsor.url}
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub Sponsor"
              aria-label="GitHub Sponsor"
              className="inline-flex items-center justify-center w-7 h-7 rounded transition-colors hover:opacity-80"
              style={{ color: siteConfig.sponsor.color }}
            >
              <Icon name={siteConfig.sponsor.icon} aria-hidden="true" />
            </a>
            <a
              href={siteConfig.coffee.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Buy Me a Coffee"
              aria-label="Buy Me a Coffee"
              className={navLinkClass}
            >
              <Icon name={siteConfig.coffee.icon} aria-hidden="true" />
            </a>
            <a
              href={siteConfig.discord.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Join our Discord"
              aria-label="Join our Discord"
              className={navLinkClass}
            >
              <Icon name={siteConfig.discord.icon} aria-hidden="true" />
            </a>
            <span className="w-px self-stretch bg-border" aria-hidden="true" />
            <a
              href={siteConfig.vscmarket.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Visual Studio Code Marketplace"
              aria-label="Visual Studio Code Marketplace"
              className={navLinkClass}
            >
              <Icon name={siteConfig.vscmarket.icon} aria-hidden="true" />
            </a>
            <a
              href={siteConfig.openvsx.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open VSX Marketplace"
              aria-label="Open VSX Marketplace"
              className={navLinkClass}
            >
              <Icon name={siteConfig.openvsx.icon} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="justify-self-center min-w-0">
          <PlaygroundName value={name} onChange={onChangeName} />
        </div>

        <div className="flex items-center gap-1 justify-self-end">
          <IconButton
            icon="vsc:new-file"
            label="New Cliff-Note"
            onClick={handleResetClick}
          />
          <span className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />
          <IconButton
            icon="bs:file-earmark-arrow-up"
            label="Load Playground"
            onClick={() => setShowLoadModal(true)}
          />
          <SplitButton
            actions={[
              { key: "local", label: "Save Locally", icon: "bs:download" },
              {
                key: "gist",
                label: "Save to GitHub Gist",
                icon: "vsc:cloud-download",
              },
            ]}
            activeKey={saveAction}
            onAction={(key) => {
              if (key === "local") {
                void downloadPlayground({
                  cliffToml,
                  commits,
                  tags,
                  options,
                  name,
                });
              } else {
                setShowSaveToGistModal(true);
              }
            }}
            onChangeActiveKey={(key) => {
              const action = key as SaveAction;
              setSaveAction(action);
              setLastSaveAction(action);
            }}
          />
          <span className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />
          <IconButton
            icon="bs:share-fill"
            label="Share Cliff Notes"
            onClick={() => setShowShareModal(true)}
          />
          {authEnabled && (
            <>
              <span className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />
              {authLoading ? (
                <span className="w-7 h-7 inline-block" aria-hidden="true" />
              ) : user ? (
                <UserMenu user={user} onLogout={() => void logout()} />
              ) : (
                <IconButton
                  icon="vsc:account"
                  label="Sign in"
                  onClick={() => setLoginModalOpen(true)}
                />
              )}
            </>
          )}
        </div>
      </header>

      {showResetModal && (
        <ConfirmResetModal
          title="Reset all to defaults"
          description="This will reset your cliff.toml, commits, tags, and options to their default values. This cannot be undone."
          onConfirm={() => {
            setShowResetModal(false);
            void onReset();
          }}
          onCancel={() => setShowResetModal(false)}
          onSave={handleSave}
        />
      )}
      {showSaveToGistModal && (
        <SaveToGistModal onClose={() => setShowSaveToGistModal(false)} />
      )}
      {showLoadModal && (
        <LoadPlaygroundModal
          onClose={() => setShowLoadModal(false)}
          onLoad={onLoad}
          onIntegrityError={onIntegrityError}
        />
      )}
      {showShareModal && (
        <ShareModal
          state={{ cliffToml, commits, tags, options, name }}
          cliffToml={cliffToml}
          onSave={() => void handleSave()}
          onClose={() => setShowShareModal(false)}
        />
      )}
      {authEnabled && loginModalOpen && <LoginModal />}
    </>
  );
}
