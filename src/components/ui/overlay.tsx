"use client";

import { CircleHelp } from "lucide-react";
import { Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { useLocale } from "@/i18n/client";
import { shellUi } from "@/i18n/messages/shell-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
};

/** Short, non-essential hints on hover and keyboard focus. */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-sm bg-navy-800 px-2.5 py-1.5 text-xs leading-4 text-white shadow-md data-[state=delayed-open]:animate-fade-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, align = "start", sideOffset = 6, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md border border-line bg-surface p-3 shadow-lg data-[state=open]:animate-rise-in focus-visible:outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

type TermTipProps = {
  /** Term being explained, used for the accessible button label. */
  term: string;
  children: ReactNode;
  className?: string;
};

/**
 * Explains a financial term. Opens on click or tap (works on touch screens
 * and with the keyboard), unlike a hover-only tooltip.
 */
export function TermTip({ term, children, className }: TermTipProps) {
  const t = shellUi[useLocale()];
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink",
          className,
        )}
        aria-label={t.whatIs(term)}
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-72 rounded-md border border-line bg-surface p-3 text-sm leading-5 text-ink-2 shadow-lg data-[state=open]:animate-rise-in focus-visible:outline-none"
        >
          <p className="mb-1 font-semibold text-ink">{term}</p>
          <div className="space-y-1.5">{children}</div>
          <PopoverPrimitive.Arrow className="fill-surface" width={10} height={5} />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
