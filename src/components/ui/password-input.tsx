"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps, type KeyboardEvent } from "react";
import { useLocale } from "@/i18n/client";
import { shellUi } from "@/i18n/messages/shell-ui";
import { cn } from "@/lib/utils";
import { inputBase } from "./input";

type PasswordInputProps = Omit<ComponentProps<"input">, "type"> & { id: string };

/** Password field with a show/hide toggle and a Caps Lock warning. */
export function PasswordInput({ className, id, onKeyDown, onKeyUp, onBlur, ...props }: PasswordInputProps) {
  const t = shellUi[useLocale()];
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const checkCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState?.("CapsLock") ?? false);

  return (
    <div className={className}>
      <div className="relative flex items-center">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cn(inputBase, "h-9 pr-10 pl-3 text-base")}
          onKeyDown={(event) => {
            checkCapsLock(event);
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            checkCapsLock(event);
            onKeyUp?.(event);
          }}
          onBlur={(event) => {
            setCapsLock(false);
            onBlur?.(event);
          }}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-controls={id}
          aria-pressed={visible}
          aria-label={t.showPassword}
          title={visible ? t.hidePassword : t.showPassword}
          className="absolute right-1 flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-emerald-500"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      <p aria-live="polite" className="text-xs text-caution-700 empty:hidden">
        {capsLock ? <span className="mt-1.5 block">{t.capsLock}</span> : null}
      </p>
    </div>
  );
}
