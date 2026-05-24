import { useState } from "react";
import { ALLOWED_REPO_HOSTS } from "@cliff-notes/shared";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

interface Props {
  isLoading: boolean;
  onLoad: (url: string, range?: { from?: string; to?: string }) => void;
}

export function RepoLoader({ isLoading, onLoad }: Props) {
  const [url, setUrl] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState(false);

  const submit = () => {
    const u = url.trim();
    if (!u) return;
    const range = from.trim() || to.trim()
      ? { from: from.trim() || undefined, to: to.trim() || undefined }
      : undefined;
    onLoad(u, range);
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-fg">
          Load from repository
        </h3>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-fg hover:text-fg"
          title={`Allowed hosts: ${ALLOWED_REPO_HOSTS.join(", ")}`}
        >
          {expanded ? "Hide range" : "Range"}
        </button>
      </div>
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
        <Button onClick={submit} disabled={!url.trim() || isLoading} size="sm">
          {isLoading ? "Loading…" : "Load"}
        </Button>
      </div>
      {expanded && (
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
    </section>
  );
}
