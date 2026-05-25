import { useState } from "react";
import { ALLOWED_REPO_HOSTS, MAX_REPO_COMMITS, MAX_REPO_TAGS } from "@cliff-notes/shared";
import { Input } from "./ui/input";
import { IconButton } from "./ui/IconButton";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { ProgressBar } from "./ui/ProgressBar";

interface Props {
  isLoading: boolean;
  onLoad: (
    url: string,
    opts?: { range?: { from?: string; to?: string }; branch?: string; cliffTomlPath?: string },
  ) => void;
}

const DEFAULT_CLIFF_TOML_PATH = "cliff.toml";

export function RepoLoader({ isLoading, onLoad }: Props) {
  const [url, setUrl] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState("");
  const [cliffTomlPath, setCliffTomlPath] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const submit = () => {
    const u = url.trim();
    if (!u) return;
    const f = from.trim();
    const t = to.trim();
    const range = f || t ? { from: f || undefined, to: t || undefined } : undefined;
    const b = branch.trim() || undefined;
    const p = cliffTomlPath.trim() || undefined;
    onLoad(u, { range, branch: b, cliffTomlPath: p });
  };

  return (
    <CollapsibleSection
      title="Load from repository"
      expandedHeaderActions={
        <IconButton
          icon="asterisk"
          label="Toggle advanced repository options"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-pressed={advancedOpen}
          className={advancedOpen ? "text-fg bg-muted/60" : ""}
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
      <p className="text-[11px] text-muted-fg leading-snug">
        Allowed git providers: {ALLOWED_REPO_HOSTS.join(", ")}. Only the cliff.toml is
        downloaded — up to {MAX_REPO_COMMITS} most recent commits and{" "}
        {MAX_REPO_TAGS} most recent tags are returned.
      </p>

      <ProgressBar
        active={isLoading}
        label="Loading repository…"
        className="mt-1"
      />

      {advancedOpen && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="from (e.g. v1.0.0)"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="text-xs"
                aria-label="from ref"
              />
              <Input
                placeholder="to (e.g. HEAD)"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="text-xs"
                aria-label="to ref"
              />
            </div>
            <p className="text-[11px] text-muted-fg leading-snug">
              Restrict the commit range loaded from the repository. Both
              endpoints accept tags, branches, or commit SHAs. Leave blank to
              load the most recent commits up to {MAX_REPO_COMMITS}.
            </p>
          </div>

          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="branch (default branch)"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="text-xs"
                aria-label="branch / tag / ref"
              />
              <Input
                placeholder={DEFAULT_CLIFF_TOML_PATH}
                value={cliffTomlPath}
                onChange={(e) => setCliffTomlPath(e.target.value)}
                className="text-xs"
                aria-label="cliff.toml path"
              />
            </div>
            <p className="text-[11px] text-muted-fg leading-snug">
              <span className="font-semibold">Branch</span> — branch, tag, or ref
              to read from. Leave blank to use the repository's default branch.
              <br />
              <span className="font-semibold">Path</span> — repo-relative path to
              the cliff.toml. Defaults to <code className="font-mono">{DEFAULT_CLIFF_TOML_PATH}</code>.
            </p>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
