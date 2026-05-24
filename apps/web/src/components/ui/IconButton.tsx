import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Bootstrap-icons class fragment without the `bi-` prefix, e.g. "trash3-fill". */
  icon: string;
  /** Accessible label; also used as the tooltip. */
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center w-7 h-7 rounded text-muted-fg uppercase",
        "hover:text-fg hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border",
        "disabled:opacity-30 disabled:pointer-events-none transition-colors",
        className,
      )}
      {...props}
    >
      <i className={`bi bi-${icon}`} aria-hidden="true" />
    </button>
  ),
);
IconButton.displayName = "IconButton";
