import { useEffect, useMemo, useRef, useState } from "react";
import { ALLOWED_REPO_HOSTS, MAX_REPO_COMMITS, MAX_REPO_TAGS } from "@cliff-notes/shared";
import { Input } from "./ui/input";
import { TextBox } from "./ui/TextBox";
import { Toggle } from "./ui/Toggle";
import { IconButton } from "./ui/IconButton";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { ProgressBar } from "./ui/ProgressBar";
import { fetchUserRepos, type RepoSuggestion } from "../lib/api";
import { useAppStore } from "../store";
import { Icon } from "./ui/Icon";

interface Props {
  isLoading: boolean;
  onLoad: (
    url: string,
    opts?: { range?: { from?: string; to?: string }; branch?: string; cliffTomlPath?: string; includeCliffToml?: boolean },
  ) => void;
}

const DEFAULT_CLIFF_TOML_PATH = "cliff.toml";

export function RepoLoader({ isLoading, onLoad }: Props) {
  const [url, setUrl] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branch, setBranch] = useState("");
  const [cliffTomlPath, setCliffTomlPath] = useState("");
  const [includeCliffToml, setIncludeCliffToml] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const user = useAppStore((s) => s.user);
  const [repos, setRepos] = useState<RepoSuggestion[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) { setRepos([]); return; }
    fetchUserRepos().then(setRepos).catch(() => {});
  }, [user]);

  // Close dropdown when clicking outside the component
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const suggestions = useMemo((): RepoSuggestion[] => {
    if (!repos.length) return [];
    const q = url.trim().toLowerCase();
    if (!q) return repos.slice(0, 8);
    return repos
      .filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.htmlUrl.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [repos, url]);

  const showDropdown = dropdownOpen && suggestions.length > 0;

  const selectSuggestion = (repo: RepoSuggestion) => {
    setUrl(repo.htmlUrl);
    setDropdownOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const submit = () => {
    const u = url.trim();
    if (!u) return;
    const f = from.trim();
    const t = to.trim();
    const range = f || t ? { from: f || undefined, to: t || undefined } : undefined;
    const b = branch.trim() || undefined;
    const p = cliffTomlPath.trim() || undefined;
    onLoad(u, { range, branch: b, cliffTomlPath: p, includeCliffToml });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (showDropdown && activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]!);
      } else {
        setDropdownOpen(false);
        submit();
      }
      return;
    }
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <CollapsibleSection
      title="Load from repository"
      defaultExpanded={false}
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
        <div ref={containerRef} className="relative flex-1 min-w-0">
          <Input
            ref={inputRef}
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setDropdownOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setDropdownOpen(true)}
            onKeyDown={handleInputKeyDown}
            className="w-full"
            aria-autocomplete={repos.length > 0 ? "list" : undefined}
            aria-expanded={showDropdown}
          />
          {showDropdown && (
            <ul
              className="absolute z-50 mt-1 w-full rounded-md border border-border bg-card shadow-md overflow-hidden"
              role="listbox"
            >
              {suggestions.map((repo, i) => (
                <li
                  key={repo.htmlUrl}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={[
                    "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer",
                    i === activeIndex ? "bg-accent text-accent-fg" : "hover:bg-muted",
                  ].join(" ")}
                  onMouseDown={(e) => {
                    // Prevent the input blur that would close the dropdown before click registers
                    e.preventDefault();
                    selectSuggestion(repo);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <Icon
                    name={repo.private ? "bs:lock" : "octicons:git-branch"}
                    size={13}
                    className="shrink-0 opacity-70"
                  />
                  <span className="font-medium truncate">{repo.fullName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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

          <div className="grid grid-cols-2 gap-2 items-start">
            <TextBox
              placeholder="branch (default branch)"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="text-xs"
              aria-label="branch / tag / ref"
              helpText={
                <><span className="font-semibold">Branch</span> — branch, tag, or ref
                to read from. Leave blank to use the repository's default branch.</>
              }
            />
            <div className="space-y-1.5">
              <TextBox
                placeholder={DEFAULT_CLIFF_TOML_PATH}
                value={cliffTomlPath}
                onChange={(e) => setCliffTomlPath(e.target.value)}
                className="text-xs"
                aria-label="cliff.toml path"
                disabled={!includeCliffToml}
                helpText={
                  <><span className="font-semibold">Path</span> — repo-relative path to
                  the cliff.toml. Defaults to <code className="font-mono">{DEFAULT_CLIFF_TOML_PATH}</code>.</>
                }
              />
              <Toggle
                label="Load cliff.toml from repository"
                checked={includeCliffToml}
                onChange={(e) => setIncludeCliffToml(e.target.checked)}
              />
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
