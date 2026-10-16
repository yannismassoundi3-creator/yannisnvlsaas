import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputBase = cn(
  "w-full min-w-0 rounded-md border border-control bg-surface text-ink shadow-xs",
  "placeholder:text-ink-4 transition-[border-color,box-shadow] duration-150",
  "hover:border-control-strong focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-emerald-500/20",
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3",
  "aria-invalid:border-negative-600 aria-invalid:focus-visible:ring-negative-600/20",
);

type InputProps = ComponentProps<"input"> & {
  /** Content rendered inside the field on the left, e.g. a currency symbol. */
  leading?: ReactNode;
  /** Content rendered inside the field on the right, e.g. a unit. */
  trailing?: ReactNode;
  inputSize?: "sm" | "md";
};

export function Input({ className, leading, trailing, inputSize = "md", ...props }: InputProps) {
  const sizing = inputSize === "sm" ? "h-8 text-sm" : "h-9 text-base";
  if (!leading && !trailing) {
    return <input className={cn(inputBase, sizing, "px-3", className)} {...props} />;
  }
  return (
    <div className={cn("relative flex items-center", className)}>
      {leading ? (
        <span className="pointer-events-none absolute left-3 text-sm text-ink-3 tabular">{leading}</span>
      ) : null}
      <input
        className={cn(inputBase, sizing, leading ? "pl-8" : "pl-3", trailing ? "pr-10" : "pr-3")}
        {...props}
      />
      {trailing ? (
        <span className="pointer-events-none absolute right-3 text-sm text-ink-3 tabular">{trailing}</span>
      ) : null}
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputBase, "min-h-24 px-3 py-2 text-base", className)} {...props} />;
}

type NativeSelectProps = ComponentProps<"select"> & { inputSize?: "sm" | "md" };

/**
 * Styled native select. Preferred for forms: it works without JavaScript,
 * submits through FormData and uses the platform picker on mobile.
 */
export function NativeSelect({ className, children, inputSize = "md", ...props }: NativeSelectProps) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(
          inputBase,
          inputSize === "sm" ? "h-8 text-sm" : "h-9 text-base",
          "appearance-none pr-9 pl-3",
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
      >
        <path d="m4.5 6.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
