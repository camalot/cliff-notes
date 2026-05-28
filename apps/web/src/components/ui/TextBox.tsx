import { type ReactNode } from "react";
import { Input, type InputProps } from "./input";
import { cn } from "@/lib/cn";

export interface TextBoxProps extends InputProps {
  helpText?: ReactNode;
  helpTextClassName?: string;
}

export function TextBox({ helpText, helpTextClassName, ...inputProps }: TextBoxProps) {
  return (
    <div className="space-y-1">
      <Input {...inputProps} />
      {helpText !== undefined && (
        <p className={cn("text-[11px] text-muted-fg leading-snug", helpTextClassName)}>
          {helpText}
        </p>
      )}
    </div>
  );
}
