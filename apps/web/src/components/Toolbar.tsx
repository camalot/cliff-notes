import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { buildShareUrl } from "@/lib/storage";

interface Props {
  onReset: () => void;
  cliffToml: string;
  commits: unknown[];
  tags: unknown[];
}

export function Toolbar({ onReset, cliffToml, commits, tags }: Props) {
  const [shared, setShared] = useState<string | null>(null);

  const share = async () => {
    const url = buildShareUrl(
      { cliffToml, commits, tags },
      window.location.origin,
      window.location.pathname,
    );
    setShared(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may not be available */
    }
  };

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">
          <span className="text-accent">cliff</span>-notes
        </span>
        <span className="text-xs text-muted-fg hidden sm:inline">
          a playground for git-cliff
        </span>
      </div>
      <div className="flex items-center gap-2 flex-1 max-w-md">
        {shared && <Input readOnly value={shared} onFocus={(e) => e.currentTarget.select()} className="text-xs" />}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
        <Button variant="secondary" size="sm" onClick={share}>
          Share URL
        </Button>
      </div>
    </header>
  );
}
