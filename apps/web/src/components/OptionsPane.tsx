import { Toggle } from "./ui/Toggle";
import { CollapsibleSection } from "./ui/CollapsibleSection";

export interface RenderOptionsState {
  unreleased: boolean;
  bumpedVersion: boolean;
}

interface Props {
  options: RenderOptionsState;
  onChange: (patch: Partial<RenderOptionsState>) => void;
}

export function OptionsPane({ options, onChange }: Props) {
  return (
    <CollapsibleSection title="Options">
      <div className="space-y-3">
        <div className="space-y-1">
          <Toggle
            checked={options.bumpedVersion}
            onChange={(e) => onChange({ bumpedVersion: e.target.checked })}
            label="Bumped version"
            labelClassName="text-xs text-fg"
          />
          <p className="text-xs text-muted-fg pl-10">
            Compute the next tag from unreleased commits and pass it as <code className="text-fg">--tag</code>.
            Honors <code className="text-fg">[bump].initial_tag</code> from cliff.toml; falls back to{" "}
            <code className="text-fg">v0.1.0</code> when not set.
          </p>
        </div>
        <div className="space-y-1">
          <Toggle
            checked={options.unreleased}
            onChange={(e) => onChange({ unreleased: e.target.checked })}
            label="Unreleased"
            labelClassName="text-xs text-fg"
          />
          <p className="text-xs text-muted-fg pl-10">
            Pass <code className="text-fg">--unreleased</code> to only include commits since the last tag.
          </p>
        </div>
      </div>
    </CollapsibleSection>
  );
}
