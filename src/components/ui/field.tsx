"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { useLocale } from "@/i18n/client";
import { shellUi } from "@/i18n/messages/shell-ui";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-sm leading-5 font-medium text-ink select-none", className)}
      {...props}
    />
  );
}

type FieldProps = {
  /** id of the control; used to connect label, hint and error. */
  htmlFor: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | string[] | null;
  optional?: boolean;
  className?: string;
  children: ReactNode;
  /** Extra element aligned with the label, e.g. a "Forgot password?" link. */
  aside?: ReactNode;
};

/**
 * Form field wrapper: label, control, hint and error message, wired up with
 * aria attributes. Controls should set aria-describedby={describedBy(id)}.
 */
export function Field({ htmlFor, label, hint, error, optional, className, children, aside }: FieldProps) {
  const errorText = Array.isArray(error) ? error[0] : error;
  const t = shellUi[useLocale()];
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>
          {label}
          {optional ? <span className="ml-1.5 font-normal text-ink-3">{t.optional}</span> : null}
        </Label>
        {aside}
      </div>
      {children}
      {hint && !errorText ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
      {errorText ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-negative-700" role="alert">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

/** Builds aria-describedby for a control rendered inside <Field>. */
export function describedBy(id: string, opts: { hint?: boolean; error?: unknown }) {
  const ids = [];
  if (opts.error) ids.push(`${id}-error`);
  else if (opts.hint) ids.push(`${id}-hint`);
  return ids.length ? ids.join(" ") : undefined;
}
