import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export const DEFAULT_PROJECT_NAME = "Untitled Project";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function ProjectName({ value, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = value.trim() || DEFAULT_PROJECT_NAME;
  const isPlaceholder = !value.trim();

  const startEdit = () => {
    setDraft(displayValue);
    setEditing(true);
  };

  const commit = () => {
    onChange(draft.trim());
    setEditing(false);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const sharedClasses =
    "text-2xl font-semibold leading-tight tracking-tight text-fg";

  if (editing) {
    return (
      <div className="relative inline-grid items-center">
        <span
          aria-hidden="true"
          className={cn(sharedClasses, "invisible whitespace-pre px-1 col-start-1 row-start-1")}
        >
          {draft || " "}
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              inputRef.current?.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className={cn(
            sharedClasses,
            "col-start-1 row-start-1 w-full bg-transparent border-0 border-b-[3px] border-accent",
            "px-1 outline-none focus:outline-none focus:ring-0",
            "text-center",
          )}
          aria-label="Project name"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title="Click to rename"
      aria-label={`Project name: ${displayValue}. Click to rename.`}
      className={cn(
        sharedClasses,
        "max-w-[40vw] truncate px-1 bg-transparent border-0 cursor-text",
        "border-b-[3px] border-transparent hover:border-border transition-colors",
        isPlaceholder && "text-muted-fg italic",
      )}
    >
      {displayValue}
    </button>
  );
}
