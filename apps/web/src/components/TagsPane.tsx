import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { IconButton } from "./ui/IconButton";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import type { UiCommit, UiTag } from "../types";
import { Icon } from "./ui/Icon";

interface Props {
  tags: UiTag[];
  commits: UiCommit[];
  onAdd: (tag: UiTag) => void;
  onUpdate: (idx: number, patch: Partial<UiTag>) => void;
  onRemove: (idx: number) => void;
  onClear: () => void;
}

export function TagsPane({ tags, commits, onAdd, onUpdate, onRemove, onClear }: Props) {
  const [name, setName] = useState("");
  const [afterIndex, setAfterIndex] = useState(commits.length - 1);

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    const idx = Math.min(Math.max(afterIndex, -1), commits.length - 1);
    onAdd({ name: n, afterIndex: idx });
    setName("");
  };

  return (
    <CollapsibleSection
      title="Tags"
      count={tags.length}
      headerActions={
        <IconButton
          icon="vsc:clear-all"
          label="Clear all tags"
          onClick={onClear}
          disabled={tags.length === 0}
        />
      }
    >
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="v1.0.0"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="flex-1 min-w-24 text-xs"
        />
        <Select
          value={String(afterIndex)}
          onChange={(e) => setAfterIndex(Number(e.target.value))}
          aria-label="Closes commits up to"
          className="text-xs flex-1 min-w-32"
        >
          <option value={-1}>(dangling)</option>
          {commits.map((c, i) => (
            <option key={i} value={i}>
              after #{i}: {c.message.split("\n")[0]!.slice(0, 40)}
            </option>
          ))}
        </Select>
        <Button onClick={submit} disabled={!name.trim()} size="sm">
          <Icon name="bi:plus-square-fill" aria-hidden="true" />
          Add
        </Button>
      </div>

      <ul className="space-y-1" data-testid="tag-list">
        {tags.length === 0 && (
          <li className="text-xs text-muted-fg italic">No tags yet.</li>
        )}
        {tags.map((t, i) => {
          const dangling = t.afterIndex < 0 || t.afterIndex >= commits.length;
          return (
            <li key={i} className="flex gap-1.5 items-center group">
              <Input
                value={t.name}
                onChange={(e) => onUpdate(i, { name: e.target.value })}
                className="font-mono text-xs w-24"
              />
              <Select
                value={String(t.afterIndex)}
                onChange={(e) =>
                  onUpdate(i, { afterIndex: Number(e.target.value) })
                }
                className="flex-1 min-w-0 text-xs"
              >
                <option value={-1}>(dangling)</option>
                {commits.map((c, j) => (
                  <option key={j} value={j}>
                    after #{j}: {c.message.split("\n")[0]!.slice(0, 40)}
                  </option>
                ))}
              </Select>
              {dangling && (
                <span className="text-xs text-danger" title="dangling tag">
                  !
                </span>
              )}
              <IconButton
                icon="trash3-fill"
                label="Delete tag"
                onClick={() => onRemove(i)}
                className="text-danger hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
              />
            </li>
          );
        })}
      </ul>
    </CollapsibleSection>
  );
}
