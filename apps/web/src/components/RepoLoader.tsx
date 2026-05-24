import { useState } from "react";
import { ALLOWED_REPO_HOSTS } from "@cliff-notes/shared";
import { Input } from "./ui/input";
import { IconButton } from "./ui/IconButton";
import { CollapsibleSection } from "./ui/CollapsibleSection";

interface Props {
  isLoading: boolean;
  onLoad: (url: string, range?: { from?: string; to?: string }) => void;
}

export function RepoLoader({ isLoading, onLoad }: Props) {
  const [url, setUrl] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);

  const submit = () => {
    const u = url.trim();
    if (!u) return;
    const range = from.trim() || to.trim()
      ? { from: from.trim() || undefined, to: to.trim() || undefined }
      : undefined;
    onLoad(u, range);
  };

  return (
    <CollapsibleSection
      title="Load from repository"
      expandedHeaderActions={
        <IconButton
          icon="layer-backward"
          label={`Toggle commit range${rangeOpen ? " (open)" : ""}. Allowed hosts: ${ALLOWED_REPO_HOSTS.join(", ")}`}
          onClick={() => setRangeOpen((v) => !v)}
          aria-pressed={rangeOpen}
          className={rangeOpen ? "text-fg bg-muted/60" : ""}
        />
      }
    >
      <div className="flex gap-2">
        <Input
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="flex-1 min-w-0"
        />
        <IconButton
          icon="box-arrow-down"
          label={isLoading ? "Loading…" : "Load"}
          onClick={submit}
          disabled={!url.trim() || isLoading}
        />
      </div>
      {rangeOpen && (
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="from (v1.0.0)"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-xs"
          />
          <Input
            placeholder="to (HEAD)"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-xs"
          />
        </div>
      )}
    </CollapsibleSection>
  );
}
