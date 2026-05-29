import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toast, type ToastKind } from "@/lib/toast";
import { Icon } from "./Icon";

const KIND_STYLES: Record<
  ToastKind,
  { icon: string; border: string; bar: string; iconColor: string }
> = {
  info: {
    icon: "info-circle-fill",
    border: "border-sky-500/50",
    bar: "bg-sky-400",
    iconColor: "text-sky-400",
  },
  success: {
    icon: "check-circle-fill",
    border: "border-emerald-500/50",
    bar: "bg-emerald-400",
    iconColor: "text-emerald-400",
  },
  error: {
    icon: "exclamation-triangle-fill",
    border: "border-danger/60",
    bar: "bg-danger",
    iconColor: "text-danger",
  },
};

interface ToastProps {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  details?: ReactNode;
  durationMs: number;
  onDismiss: (id: string) => void;
}

export function Toast({
  id, kind, title, message, details, durationMs, onDismiss,
}: ToastProps) {
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const styles = KIND_STYLES[kind];
  const expandable = details !== undefined && details !== null && details !== "";
  const copyable = kind === "error";

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const parts: string[] = [title];
    if (message) parts.push(message);
    if (typeof details === "string") parts.push("", details);
    try {
      await navigator.clipboard.writeText(parts.join("\n"));
      toast.success("Error message copied");
    } catch (err) {
      toast.error("Couldn't copy to clipboard", { message: String(err) });
    }
  };

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => expandable && setExpanded((v) => !v)}
      className={cn(
        "toast-in relative w-80 overflow-hidden rounded-md border bg-card text-card-fg shadow-lg",
        styles.border,
        expandable ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="flex items-start gap-2 p-3 pr-9">
        <i
          className={cn("bi text-base leading-5 mt-0.5", `bi-${styles.icon}`, styles.iconColor)}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          {message && (
            <div className="text-xs text-muted-fg whitespace-pre-wrap break-words mt-0.5">
              {message}
            </div>
          )}
          {expandable && expanded && (
            <div className="mt-2 border-t border-border pt-2 text-xs text-muted-fg whitespace-pre-wrap break-words font-mono">
              {details}
            </div>
          )}
          {expandable && !expanded && (
            <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-fg/70">
              Click for details
            </div>
          )}
          {copyable && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copy error message"
                title="Copy error message"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-fg hover:text-fg hover:bg-muted/60"
              >
                <Icon name="bs:clipboard" className="text-sm leading-none" />
                Copy
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(id);
        }}
        aria-label="Dismiss notification"
        title="Dismiss"
        className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded text-muted-fg hover:text-fg hover:bg-muted/60"
      >
        <Icon name="bs:x" className="text-lg leading-none" aria-hidden="true" />
      </button>

      <div
        onAnimationEnd={() => onDismiss(id)}
        style={{
          animationDuration: `${durationMs}ms`,
          animationPlayState: paused ? "paused" : "running",
        }}
        className={cn("toast-bar absolute bottom-0 left-0 h-0.5 w-full", styles.bar)}
      />
    </div>
  );
}
