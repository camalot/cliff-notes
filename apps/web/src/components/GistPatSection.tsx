import { Input } from "./ui/input";
import { Toggle } from "./ui/Toggle";
import { IconButton } from "./ui/IconButton";

interface GistPatSectionProps {
  pat: string;
  onPatChange: (pat: string) => void;
  savePat: boolean;
  onSavePatChange: (save: boolean) => void;
  /** If provided, a login button is shown next to the PAT input. */
  onLogin?: () => void;
}

export function GistPatSection({ pat, onPatChange, savePat, onSavePatChange, onLogin }: GistPatSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Personal Access Token</label>
      <div className="flex items-center gap-2">
        <Input
          type="password"
          placeholder="ghp_…"
          value={pat}
          onChange={(e) => onPatChange(e.target.value)}
          autoComplete="off"
          className="flex-1"
        />
        {onLogin && (
          <IconButton
            icon="vsc:account"
            label="Login with GitHub"
            onClick={onLogin}
          />
        )}
      </div>
      <p className="text-xs text-muted-fg">
        Needs the <code>gist</code> scope.{" "}
        <a
          href="https://github.com/settings/tokens/new?scopes=gist"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Create one
        </a>
      </p>
      <Toggle
        label="Save token in browser"
        checked={savePat}
        onChange={(e) => onSavePatChange(e.target.checked)}
      />
    </div>
  );
}
