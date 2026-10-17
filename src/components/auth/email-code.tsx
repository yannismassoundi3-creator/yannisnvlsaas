"use client";

import type { ComponentProps } from "react";
import { inputBase } from "@/components/ui/input";
import type { Locale } from "@/i18n/config";
import { authFormMessages } from "@/i18n/messages/auth-forms";
import { authErrorMessage } from "@/lib/auth/validation";
import { cn } from "@/lib/utils";

export const CODE_LENGTH = 6;

/** One field for the 6-digit email code: digits only, autofilled from the email on phones. */
export function CodeInput({ value, onValueChange, className, ...props }: Omit<ComponentProps<"input">, "onChange" | "value"> & { value: string; onValueChange: (value: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern={`\\d{${CODE_LENGTH}}`}
      maxLength={CODE_LENGTH}
      value={value}
      onChange={(e) => onValueChange(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
      className={cn(inputBase, "h-11 px-3 text-center font-mono text-xl tracking-[0.4em] tabular", className)}
      {...props}
    />
  );
}

/** Supabase answers a wrong or expired code with otp_expired (403). */
export function codeErrorMessage(error: { code?: string; message?: string; status?: number }, locale: Locale) {
  if (error.code === "otp_expired" || error.status === 403) return authFormMessages[locale].code.invalid;
  return authErrorMessage(error, locale);
}
