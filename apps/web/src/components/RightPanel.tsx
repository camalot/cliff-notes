import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ConventionalType } from "@cliff-notes/shared";
import { Card, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { RepoLoader } from "./RepoLoader";
import { TagsPane } from "./TagsPane";
import { CommitsPane } from "./CommitsPane";
import { cn } from "@/lib/cn";
import { CLIFF_TOML_THEME_ID } from "@/lib/monaco-cliff-toml";
import type { UiCommit, UiTag } from "../types";

type Tab = "config" | "changelog" | "raw";

interface Props {
  // Generate
  isRendering: boolean;
  onGenerate: () => void;

  // Output
  markdown: string | null;
  warnings: string[];
  error: string | null;

  // Config — repo loader
  isLoadingRepo: boolean;
  onLoadRepo: (url: string, range?: { from?: string; to?: string }) => void;

  // Config — tags
  tags: UiTag[];
  onAddTag: (tag: UiTag) => void;
  onUpdateTag: (idx: number, patch: Partial<UiTag>) => void;
  onRemoveTag: (idx: number) => void;
  onClearTags: () => void;

  // Config — commits
  commits: UiCommit[];
  onAddCommit: (message: string) => void;
  onAddRandomCommits: (type: ConventionalType, breaking: boolean, count: number) => void;
  onUpdateCommit: (idx: number, patch: Partial<UiCommit>) => void;
  onRemoveCommit: (idx: number) => void;
  onMoveCommit: (from: number, to: number) => void;
  onClearCommits: () => void;
  onTagHere: (idx: number) => void;
}

export function RightPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("config");
  const [justCopied, setJustCopied] = useState(false);
  const hasOutput = !!props.markdown;

  // If output disappears (e.g. after Reset), snap back to the Config tab.
  useEffect(() => {
    if (!hasOutput && tab !== "config") setTab("config");
  }, [hasOutput, tab]);

  const copy = async () => {
    if (!props.markdown) return;
    await navigator.clipboard.writeText(props.markdown);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1500);
  };

  return (
    <Card className="flex flex-col min-h-0">
      <CardHeader>
        <Tabs tab={tab} setTab={setTab} hasOutput={hasOutput} />
        <div className="flex items-center gap-2">
          {tab !== "config" && (
            <Button size="sm" variant="secondary" onClick={copy} disabled={!props.markdown}>
              {justCopied ? "Copied!" : "Copy"}
            </Button>
          )}
          <Button size="sm" onClick={props.onGenerate} disabled={props.isRendering}>
            {props.isRendering ? "Generating…" : "Generate"}
          </Button>
        </div>
      </CardHeader>

      <div className="flex-1 min-h-0">
        {tab === "config" && <ConfigTab {...props} />}
        {tab === "changelog" && (
          <ChangelogTab markdown={props.markdown} warnings={props.warnings} error={props.error} />
        )}
        {tab === "raw" && <RawTab markdown={props.markdown} />}
      </div>
    </Card>
  );
}

function Tabs({
  tab, setTab, hasOutput,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  hasOutput: boolean;
}) {
  const item = (id: Tab, label: string, disabled = false) => (
    <button
      key={id}
      type="button"
      onClick={() => !disabled && setTab(id)}
      disabled={disabled}
      className={cn(
        "px-3 py-1 text-xs transition-colors",
        tab === id
          ? "bg-accent text-accent-fg"
          : disabled
            ? "bg-card text-muted-fg/50 cursor-not-allowed"
            : "bg-card text-muted-fg hover:text-fg",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex rounded-md border border-border overflow-hidden">
      {item("config", "Config")}
      {item("changelog", "Changelog", !hasOutput)}
      {item("raw", "Raw", !hasOutput)}
    </div>
  );
}

function ConfigTab(props: Props) {
  return (
    <div className="h-full overflow-auto">
      <div className="p-3 space-y-4 divide-y divide-border [&>section:not(:first-child)]:pt-4">
        <RepoLoader isLoading={props.isLoadingRepo} onLoad={props.onLoadRepo} />
        <TagsPane
          tags={props.tags}
          commits={props.commits}
          onAdd={props.onAddTag}
          onUpdate={props.onUpdateTag}
          onRemove={props.onRemoveTag}
          onClear={props.onClearTags}
        />
        <CommitsPane
          commits={props.commits}
          tags={props.tags}
          onAdd={props.onAddCommit}
          onAddRandom={props.onAddRandomCommits}
          onUpdate={props.onUpdateCommit}
          onRemove={props.onRemoveCommit}
          onMove={props.onMoveCommit}
          onClear={props.onClearCommits}
          onTagHere={props.onTagHere}
        />
      </div>
    </div>
  );
}

function ChangelogTab({
  markdown, warnings, error,
}: {
  markdown: string | null;
  warnings: string[];
  error: string | null;
}) {
  if (!markdown && !error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-fg">No changelog yet.</p>
          <p className="text-xs text-muted-fg">
            Click <span className="font-semibold text-fg">Generate</span> to render it here.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto">
      {error && (
        <div className="m-3 rounded-md border border-danger/50 bg-danger/10 text-danger p-3 text-sm whitespace-pre-wrap font-mono">
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="m-3 rounded-md border border-yellow-500/50 bg-yellow-500/10 text-yellow-200 p-2 text-xs space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="font-mono">{w}</div>
          ))}
        </div>
      )}
      {markdown && (
        <div className="markdown-preview p-4 text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function RawTab({ markdown }: { markdown: string | null }) {
  if (!markdown) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-sm text-muted-fg">No changelog yet.</p>
      </div>
    );
  }
  return (
    <Editor
      height="100%"
      theme={CLIFF_TOML_THEME_ID}
      defaultLanguage="markdown"
      language="markdown"
      value={markdown}
      options={{
        readOnly: true,
        fontSize: 13,
        minimap: {
          enabled: true,
          renderCharacters: false,
          showSlider: "always",
          size: "proportional",
        },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        scrollbar: {
          vertical: "visible",
          horizontal: "visible",
          useShadows: false,
          verticalScrollbarSize: 12,
          horizontalScrollbarSize: 12,
        },
      }}
    />
  );
}
