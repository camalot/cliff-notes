import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type { ConventionalType, RemoteKind } from "@cliff-notes/shared";
import { renderMarkdown } from "@/lib/markdown";
import { Card, CardHeader } from "./ui/card";
import { Button } from "./ui/button";
import { IconButton } from "./ui/IconButton";
import { ProgressBar } from "./ui/ProgressBar";
import { RepoLoader } from "./RepoLoader";
import { OptionsPane, type RenderOptionsState } from "./OptionsPane";
import { TagsPane } from "./TagsPane";
import { CommitsPane } from "./CommitsPane";
import { cn } from "@/lib/cn";
import { CLIFF_TOML_THEME_ID } from "@/lib/monaco-cliff-toml";
import { toast } from "@/lib/toast";
import type { UiCommit, UiTag } from "../types";
import { Icon } from "./ui/Icon";

type Tab = "config" | "changelog" | "raw";

interface Props {
  // Generate
  isRendering: boolean;
  onGenerate: () => void;
  onResetConfig: () => void;
  configDirty: boolean;

  // Output
  markdown: string | null;
  warnings: string[];
  mockedRemotes: RemoteKind[];

  // Config — options
  options: RenderOptionsState;
  onChangeOptions: (patch: Partial<RenderOptionsState>) => void;

  // Config — repo loader
  isLoadingRepo: boolean;
  onLoadRepo: (
    url: string,
    opts?: { range?: { from?: string; to?: string }; branch?: string; cliffTomlPath?: string },
  ) => void;

  // Config — tags
  tags: UiTag[];
  onAddTag: (tag: UiTag) => void;
  onUpdateTag: (idx: number, patch: Partial<UiTag>) => void;
  onRemoveTag: (idx: number) => void;
  onClearTags: () => void;

  // Config — commits
  commits: UiCommit[];
  onAddCommit: (message: string) => void;
  onAddRandomCommits: (
    type: ConventionalType | undefined,
    breaking: boolean,
    count: number,
    squash?: boolean,
    coAuthors?: number,
  ) => void;
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
  const wasRendering = useRef(props.isRendering);

  // If output disappears (e.g. after Reset), snap back to the Config tab.
  useEffect(() => {
    if (!hasOutput && tab !== "config") setTab("config");
  }, [hasOutput, tab]);

  // When a generation finishes successfully, jump to the Changelog tab so the
  // user sees the result immediately. We watch the isRendering true→false
  // transition rather than markdown identity so re-generating the same output
  // still switches.
  useEffect(() => {
    if (wasRendering.current && !props.isRendering && props.markdown) {
      setTab("changelog");
    }
    wasRendering.current = props.isRendering;
  }, [props.isRendering, props.markdown]);

  const copy = async () => {
    if (!props.markdown) return;
    try {
      await navigator.clipboard.writeText(props.markdown);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 1500);
      toast.success("Changelog copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy", { message: String(err) });
    }
  };

  const isDirty = props.configDirty && hasOutput;

  return (
    <Card className="flex flex-col min-h-0">
      <CardHeader className="p-0 gap-0">
        <Tabs tab={tab} setTab={setTab} hasOutput={hasOutput} isDirty={isDirty} />
        <div className="flex items-center gap-2 py-2 pr-3">
          <Button
            size="sm"
            onClick={props.onGenerate}
            disabled={props.isRendering || (!props.configDirty && hasOutput)}
          >
            <Icon name="vsc:chip" aria-hidden="true" />
            {props.isRendering ? "Generating…" : "Generate"}
          </Button>
          <span className="w-px h-5 bg-border" aria-hidden="true" />
          <IconButton
            icon="vsc:discard"
            label="Reset Config"
            onClick={props.onResetConfig}
          />
          {tab !== "config" && (
            <>
              <span className="w-px h-5 bg-border" aria-hidden="true" />
              <IconButton
                icon={justCopied ? "vsc:check" : "vsc:copy"}
                label={justCopied ? "Copied!" : "Copy"}
                onClick={copy}
                disabled={!props.markdown}
              />
            </>
          )}
        </div>
      </CardHeader>

      <ProgressBar active={props.isRendering} label="Generating changelog…" />

      <div className="flex-1 min-h-0">
        {tab === "config" && <ConfigTab {...props} />}
        {tab === "changelog" && (
          <ChangelogTab
            markdown={props.markdown}
            warnings={props.warnings}
            mockedRemotes={props.mockedRemotes}
          />
        )}
        {tab === "raw" && <RawTab markdown={props.markdown} />}
      </div>
    </Card>
  );
}

function Tabs({
  tab, setTab, hasOutput, isDirty,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  hasOutput: boolean;
  isDirty: boolean;
}) {
  const item = (id: Tab, label: string, icon: string, disabled = false, dirty = false, extraClass = "") => (
    <button
      key={id}
      type="button"
      onClick={() => !disabled && setTab(id)}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex-1 inline-flex items-center justify-center gap-1.5 px-3 h-full text-xs font-bold transition-colors uppercase",
        tab === id
          ? "bg-accent text-accent-fg"
          : disabled
            ? "bg-card text-muted-fg/50 cursor-not-allowed"
            : "bg-card text-muted-fg hover:text-fg",
        extraClass,
      )}
    >
      <Icon name={icon} aria-hidden="true" />
      <span>{label}</span>
      {dirty && <span aria-hidden="true">{"•"}</span>}
    </button>
  );

  return (
    <div className="flex self-stretch overflow-hidden rounded-tl-lg">
      {item("config", "Config", "gear-fill")}
      {item("changelog", "Changelog", "eye-fill", !hasOutput, isDirty)}
      {item("raw", "Markdown", "markdown", !hasOutput, isDirty, "border-r border-border")}
    </div>
  );
}

function ConfigTab(props: Props) {
  return (
    <div className="h-full overflow-auto">
      <div className="p-3 space-y-4 divide-y divide-border [&>section:not(:first-child)]:pt-4 [&>section:not(:last-child)]:pb-4">
        <OptionsPane options={props.options} onChange={props.onChangeOptions} />
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
  markdown, warnings, mockedRemotes,
}: {
  markdown: string | null;
  warnings: string[];
  mockedRemotes: RemoteKind[];
}) {
  if (!markdown) {
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
      {mockedRemotes.length > 0 && (
        <div
          className="m-3 rounded-md border border-sky-500/50 bg-sky-500/10 text-sky-200 p-2 text-xs"
          title="cliff-notes stripped your [remote.*] section(s) and substituted deterministic mock data. PR numbers and contributor lists here won't match your real repo."
        >
          <span className="font-semibold">Remote data is mocked:</span>{" "}
          <span className="font-mono">{mockedRemotes.join(", ")}</span>
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
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />
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
