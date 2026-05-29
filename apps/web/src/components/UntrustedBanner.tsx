import { Icon } from "./ui/Icon";

interface Props {
  onDismiss: () => void;
}

export function UntrustedBanner({ onDismiss }: Props) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-4 py-2 bg-yellow-500/15 border-b border-yellow-500/30 text-yellow-400 text-xs"
    >
      <Icon name="bs:exclamation-triangle-fill" className="shrink-0" aria-hidden="true" />
      <span className="flex-1">
        Loaded without integrity check — this playground was not verified. Edit anything to clear
        this warning.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-yellow-400/70 hover:text-yellow-400 transition-colors ml-2"
        aria-label="Dismiss warning"
      >
        <Icon name="bs:x-lg" aria-hidden="true" />
      </button>
    </div>
  );
}
