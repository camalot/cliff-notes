import { cn } from "@/lib/cn";

interface Props {
  active: boolean;
  label?: string;
  className?: string;
}

/**
 * Indeterminate progress bar. Renders a thin animated track when `active` is
 * true; collapses to nothing otherwise. Use to signal that a long-running
 * operation (e.g. server-side render) is in flight when progress is unknown.
 */
export function ProgressBar({ active, label = "Working…", className }: Props) {
  if (!active) return null;
  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-label={label}
      className={cn("progress-indeterminate h-1 w-full", className)}
    />
  );
}
