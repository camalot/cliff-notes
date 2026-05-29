import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { Icon } from "./Icon";

export interface SplitButtonAction {
  key: string;
  label: string;
  icon: string;
}

interface SplitButtonProps {
  actions: SplitButtonAction[];
  activeKey: string;
  onAction: (key: string) => void;
  onChangeActiveKey: (key: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SplitButton({
  actions,
  activeKey,
  onAction,
  onChangeActiveKey,
  disabled,
  className,
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = actions.find((a) => a.key === activeKey) ?? actions[0]!;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const baseBtn = cn(
    "flex items-center gap-1.5 px-2.5 h-7 text-xs font-medium uppercase",
    "bg-muted text-fg border border-border",
    "hover:bg-muted/70 transition-colors",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  );

  return (
    <div ref={ref} className={cn("relative flex", className)}>
      {/* Main action button */}
      <button
        type="button"
        disabled={disabled}
        title={active.label}
        aria-label={active.label}
        className={cn(baseBtn, "rounded-l-md border-r-0")}
        onClick={() => onAction(active.key)}
      >
        <Icon name={active.icon} size={14} />
      </button>

      {/* Chevron dropdown trigger */}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(baseBtn, "rounded-r-md px-1.5")}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="vsc:chevron-down" size={12} />
      </button>

      {/* Dropdown menu */}
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 z-50 min-w-40 bg-card border border-border rounded-md shadow-lg py-1"
        >
          {actions.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                role="option"
                aria-selected={action.key === activeKey}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left text-fg",
                  "hover:bg-muted/60 transition-colors",
                  action.key === activeKey && "bg-accent/20",
                )}
                onClick={() => {
                  onChangeActiveKey(action.key);
                  onAction(action.key);
                  setOpen(false);
                }}
              >
                <Icon name={action.icon} size={14} />
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
