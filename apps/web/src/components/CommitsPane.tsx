import { useState } from "react";
import { CONVENTIONAL_TYPES, type ConventionalType } from "@cliff-notes/shared";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import type { UiCommit, UiTag } from "../types";

interface Props {
  commits: UiCommit[];
  tags: UiTag[];
  onAdd: (message: string) => void;
  onAddRandom: (type: ConventionalType, breaking: boolean, count: number) => void;
  onUpdate: (idx: number, patch: Partial<UiCommit>) => void;
  onRemove: (idx: number) => void;
  onMove: (from: number, to: number) => void;
  onClear: () => void;
  onTagHere: (idx: number) => void;
}

export function CommitsPane({
  commits, tags, onAdd, onAddRandom, onUpdate, onRemove, onMove, onClear, onTagHere,
}: Props) {
  const [manual, setManual] = useState("");
  const [type, setType] = useState<ConventionalType>("feat");
  const [breaking, setBreaking] = useState(false);
  const [count, setCount] = useState(1);
  const [showRandom, setShowRandom] = useState(false);

  const submitManual = () => {
    const m = manual.trim();
    if (!m) return;
    onAdd(m);
    setManual("");
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
          Commits <span className="text-muted-fg/70 normal-case font-normal">({commits.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRandom((v) => !v)}
            className="text-xs text-muted-fg hover:text-fg"
          >
            {showRandom ? "Hide random" : "Random"}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={commits.length === 0}
            className="text-xs text-muted-fg hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="feat(api): add cool thing"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitManual();
          }}
          className="flex-1 text-xs"
        />
        <Button onClick={submitManual} size="sm" disabled={!manual.trim()}>
          Add
        </Button>
      </div>

      {showRandom && (
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <Select value={type} onChange={(e) => setType(e.target.value as ConventionalType)} className="text-xs">
            {CONVENTIONAL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <label className="flex items-center gap-1 text-muted-fg">
            <input
              type="checkbox"
              checked={breaking}
              onChange={(e) => setBreaking(e.target.checked)}
            />
            breaking
          </label>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-14 text-xs"
            aria-label="count"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onAddRandom(type, breaking, count)}
          >
            Insert {breaking ? `${type}!` : type} × {count}
          </Button>
        </div>
      )}

      <ol className="space-y-1" data-testid="commit-list">
        {commits.length === 0 && (
          <li className="text-xs text-muted-fg italic">No commits yet — add one above.</li>
        )}
        {commits.map((c, i) => {
          const tagsHere = tags.filter((t) => t.afterIndex === i);
          return (
            <li key={i} className="space-y-1">
              <div className="flex gap-1.5 items-center group">
                <span className="text-[10px] text-muted-fg font-mono w-5 text-right shrink-0">{i}</span>
                <Input
                  value={c.message}
                  onChange={(e) => onUpdate(i, { message: e.target.value })}
                  className="font-mono text-xs flex-1 min-w-0"
                />
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => onMove(i, i - 1)} disabled={i === 0} title="Move up">↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => onMove(i, i + 1)} disabled={i === commits.length - 1} title="Move down">↓</Button>
                  <Button size="sm" variant="ghost" onClick={() => onTagHere(i)} title="Tag a release after this commit">🏷</Button>
                  <Button size="sm" variant="danger" onClick={() => onRemove(i)}>✕</Button>
                </div>
              </div>
              {tagsHere.map((t) => (
                <div
                  key={t.name + i}
                  className="ml-7 text-[11px] px-1.5 py-0.5 rounded bg-accent/20 text-accent border border-accent/40 font-mono inline-block"
                >
                  🏷 {t.name}
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
