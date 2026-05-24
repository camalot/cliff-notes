import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  labelClassName?: string;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, className, labelClassName, disabled, ...props }, ref) => (
    <label
      className={cn(
        "inline-flex items-center gap-2 select-none",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <input ref={ref} type="checkbox" disabled={disabled} className="sr-only peer" {...props} />
      <span
        className={cn(
          "relative w-8 h-4 rounded-full bg-muted border border-border transition-colors",
          "peer-checked:bg-accent peer-checked:border-accent",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-bg",
          "after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:h-3 after:w-3 after:rounded-full after:bg-fg after:transition-transform",
          "peer-checked:after:translate-x-4 peer-checked:after:bg-accent-fg",
          className,
        )}
      />
      {label !== undefined && (
        <span className={cn("text-xs text-muted-fg", labelClassName)}>{label}</span>
      )}
    </label>
  ),
);
Toggle.displayName = "Toggle";
