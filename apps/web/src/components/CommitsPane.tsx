import { useRef } from "react";
import { useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { CONVENTIONAL_TYPES, type ConventionalType } from "@cliff-notes/shared";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select } from "./ui/select";
import { IconButton } from "./ui/IconButton";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { Toggle } from "./ui/Toggle";
import { registerGitCommit, GIT_COMMIT_LANGUAGE_ID } from "../lib/monaco-git-commit";
import { CLIFF_TOML_THEME_ID } from "../lib/monaco-cliff-toml";
import { cn } from "@/lib/cn";
import type { UiCommit, UiTag } from "../types";

interface Props {
  commits: UiCommit[];
  tags: UiTag[];
  onAdd: (message: string) => void;
  onAddRandom: (
    type: ConventionalType | undefined,
    breaking: boolean,
    count: number,
    squash?: boolean,
    coAuthors?: number,
  ) => void;
  onUpdate: (idx: number, patch: Partial<UiCommit>) => void;
  onRemove: (idx: number) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
  onTagHere: (idx: number) => void;
}

function isBreakingCommit(message: string): boolean {
  const firstLine = message.split('\n')[0] || "";
  if (/^[a-z]+(?:\([^)]*\))?!:/.test(firstLine)) return true;
  if (/^BREAKING[- ]CHANGE/m.test(message)) return true;
  return false;
}

export function CommitsPane({
  commits, tags, onAdd, onAddRandom, onUpdate, onRemove, onMove, onClear, onTagHere,
}: Props) {
  const [manual, setManual] = useState("");
  const [type, setType] = useState<ConventionalType | "random">("random");
  const [breaking, setBreaking] = useState(false);
  const [count, setCount] = useState(1);
  const [squash, setSquash] = useState(false);
  const [coAuthors, setCoAuthors] = useState(0);
  const [showRandom, setShowRandom] = useState(false);
  const editorRef = useRef<any>(null);

  const submitManual = () => {
    const m = manual.trim();
    if (!m) return;
    onAdd(m);
    setManual("");
    editorRef.current?.focus();
  };

  const effectiveCount = count < 2 ? 1 : count;
  if (count < 2 && squash) {
    setSquash(false);
  }

  const handleEditorMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    registerGitCommit(monaco);
    editor.addCommand(2048 + 256, submitManual); // Ctrl+Enter / Cmd+Enter
  };

  return (
    <CollapsibleSection
      title="Commits"
      count={commits.length}
      headerActions={
        <IconButton
          icon="slash-square"
          label="Clear all commits"
          onClick={onClear}
          disabled={commits.length === 0}
        />
      }
      expandedHeaderActions={
        <IconButton
          icon="shuffle"
          label={showRandom ? "Hide random generator" : "Show random generator"}
          onClick={() => setShowRandom((v) => !v)}
          aria-pressed={showRandom}
          className={showRandom ? "text-fg bg-muted/60" : ""}
        />
      }
    >
      {showRandom && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs p-2 border border-border rounded-md bg-card/50">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as ConventionalType | "random")}
            className="text-xs"
            aria-label="type"
          >
            <option value="random">random</option>
            {CONVENTIONAL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Toggle
            label="breaking"
            checked={breaking}
            onChange={(e) => setBreaking(e.target.checked)}
          />
          <label className="flex items-center gap-2 text-muted-fg">
            <span>count</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-14 text-xs"
              aria-label="count"
            />
          </label>

          {effectiveCount >= 2 && (
            <Toggle
              label="squash"
              checked={squash}
              onChange={(e) => setSquash(e.target.checked)}
            />
          )}
          {effectiveCount >= 2 && squash && (
            <label className="flex items-center gap-2 text-muted-fg">
              <span>co-authors</span>
              <Input
                type="number"
                min={0}
                max={5}
                value={coAuthors}
                onChange={(e) => setCoAuthors(Math.max(0, Math.min(5, Number(e.target.value) || 0)))}
                className="w-12 text-xs"
                aria-label="co-authors count"
              />
            </label>
          )}

          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => {
              const resolved: ConventionalType | undefined =
                type === "random" ? undefined : type;
              onAddRandom(resolved, breaking, effectiveCount, squash, squash ? coAuthors : 0);
            }}
          >
            <i className="bi bi-arrow-bar-left" aria-hidden="true" />
            Insert {type === "random" ? "random" : breaking ? `${type}!` : type} × {effectiveCount}
            {squash && " (squash)"}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 border border-border rounded-md overflow-hidden bg-card">
        <Editor
          height={120}
          language={GIT_COMMIT_LANGUAGE_ID}
          theme={CLIFF_TOML_THEME_ID}
          value={manual}
          onChange={(v) => setManual(v ?? "")}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            lineNumbers: "off",
            fontSize: 12,
            fontFamily: "monospace",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            renderLineHighlight: "none",
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            glyphMargin: false,
            folding: false,
            padding: { top: 6, bottom: 6 },
            tabSize: 2,
            insertSpaces: true,
            scrollbar: { useShadows: false, vertical: "auto", horizontal: "auto" },
          }}
        />
        <div className="px-2 pt-2 pb-2 flex gap-1 justify-end border-t border-border">
          <span className="text-[10px] text-muted-fg italic flex-1">⌘↵ to submit</span>
          <Button onClick={submitManual} size="sm" disabled={!manual.trim()}>
            <i className="bi bi-plus-square-fill" aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>

      <ol className="space-y-1" data-testid="commit-list">
        {commits.length === 0 && (
          <li className="text-xs text-muted-fg italic">No commits yet — add one above.</li>
        )}
        {commits.map((_c, offset) => {
          // Render newest (highest storage index) first while keeping `i` as the storage index
          // so handler arguments and tag.afterIndex semantics remain unchanged.
          const i = commits.length - 1 - offset;
          const c = commits[i]!;
          const tagsHere = tags.filter((t) => t.afterIndex === i);
          const breaking = isBreakingCommit(c.message);
          const numLines = c.message.split('\n').length;
          const ignored = !!c.ignored;
          return (
            <li key={i} className="space-y-1">
              {tagsHere.map((t) => (
                <div
                  key={t.name + i}
                  className="ml-7 text-[11px] px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/40 font-mono inline-flex items-center gap-1"
                >
                  <i className="bi bi-tag" aria-hidden="true" />
                  {t.name}
                </div>
              ))}
              <div className="flex gap-1.5 items-start group">
                <div className="flex items-center gap-1 pt-2 shrink-0">
                  <span className="text-[10px] text-muted-fg font-mono w-5 text-right">{i}</span>
                  <span className="text-[10px] font-bold text-red-400 shrink-0 w-3" title={breaking ? "Breaking change" : undefined}>
                    {breaking && "!"}
                  </span>
                </div>
                <IconButton
                  icon={ignored ? "eye-slash" : "eye"}
                  label={ignored ? "Include in changelog" : "Ignore from changelog"}
                  onClick={() => onUpdate(i, { ignored: !ignored })}
                  aria-pressed={ignored}
                  className={cn("mt-1 shrink-0", ignored && "text-muted-fg/70")}
                />
                <Textarea
                  value={c.message}
                  onChange={(e) => onUpdate(i, { message: e.target.value })}
                  className={cn(
                    "font-mono text-xs flex-1 min-w-0 resize-none leading-snug",
                    ignored && "opacity-50 line-through",
                  )}
                  rows={Math.max(1, Math.min(numLines, 8))}
                />
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 pt-1">
                  <IconButton icon="arrow-up" label="Move up" onClick={() => onMove(i, i + 1)} disabled={i === commits.length - 1} />
                  <IconButton icon="arrow-down" label="Move down" onClick={() => onMove(i, i - 1)} disabled={i === 0} />
                  <IconButton icon="tag" label="Tag a release after this commit" onClick={() => onTagHere(i)} />
                  <IconButton
                    icon="trash3-fill"
                    label="Delete commit"
                    onClick={() => onRemove(i)}
                    className="text-danger hover:text-danger hover:bg-danger/10"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </CollapsibleSection>
  );
}
