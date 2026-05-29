import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon name: "bs:name" or bare "name" for Bootstrap, "octicon:name" for Octicons, or "/path" for URLs. */
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
      <Icon name={icon} size={16} />
    </button>
  ),
);
IconButton.displayName = "IconButton";
