import { useState, type ReactNode, type MouseEvent } from "react";
import { cn } from "@/lib/cn";

interface Props {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  /** Toolbar buttons rendered in the header regardless of expansion state. */
  headerActions?: ReactNode;
  /** Toolbar buttons rendered in the header only when expanded. */
  expandedHeaderActions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  count,
  defaultExpanded = true,
  headerActions,
  expandedHeaderActions,
  children,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = () => setExpanded((v) => !v);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <section className={cn("space-y-2", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={onKey}
        className="flex items-center justify-between gap-2 min-h-7 cursor-pointer select-none -mx-1 px-1 rounded hover:bg-muted/40"
      >
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-fg">
          <i
            className={cn(
              "bi text-muted-fg/70 transition-transform",
              expanded ? "bi-chevron-down" : "bi-chevron-right",
            )}
            aria-hidden="true"
          />
          <span>{title}</span>
          {typeof count === "number" && (
            <span className="text-muted-fg/70 normal-case font-normal">({count})</span>
          )}
        </h3>
        <div
          className="flex items-center gap-1"
          onClick={stopPropagation}
          onKeyDown={stopPropagation}
        >
          {headerActions}
          {expanded && expandedHeaderActions}
        </div>
      </div>
      {expanded && children}
    </section>
  );
}

function stopPropagation(e: MouseEvent | React.KeyboardEvent) {
  e.stopPropagation();
}
