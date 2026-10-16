"use client";

import { X } from "lucide-react";
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlayClass =
  "fixed inset-0 z-50 bg-navy-900/35 backdrop-blur-[1px] data-[state=open]:animate-fade-in";
const contentClass = cn(
  "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
  "max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-line bg-surface shadow-lg",
  "data-[state=open]:animate-rise-in focus-visible:outline-none",
);

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  title: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
};

export function DialogContent({
  title,
  description,
  size = "md",
  footer,
  className,
  children,
  ...props
}: DialogContentProps) {
  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClass} />
      <DialogPrimitive.Content className={cn(contentClass, width, className)} {...props}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="space-y-1">
            <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-sm text-ink-3">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mt-1 -mr-1.5">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

type ConfirmDialogProps = {
  trigger: ReactNode;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Runs when confirmed. Return a promise to keep the dialog busy while it runs. */
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
};

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  pending = false,
  open,
  onOpenChange,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Trigger asChild>{trigger}</AlertPrimitive.Trigger>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlayClass} />
        <AlertPrimitive.Content className={cn(contentClass, "max-w-md")}>
          <div className="space-y-1.5 px-5 pt-5">
            <AlertPrimitive.Title className="text-lg font-semibold tracking-tight text-ink">{title}</AlertPrimitive.Title>
            <AlertPrimitive.Description className="text-sm text-ink-2">{description}</AlertPrimitive.Description>
          </div>
          {children ? <div className="px-5 pt-3">{children}</div> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 sm:flex-row sm:justify-end">
            <AlertPrimitive.Cancel asChild>
              <Button variant="secondary" disabled={pending}>
                {cancelLabel}
              </Button>
            </AlertPrimitive.Cancel>
            <Button
              variant={destructive ? "danger" : "primary"}
              loading={pending}
              onClick={(event) => {
                event.preventDefault();
                void onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}
