"use client";

import { Toaster as Sonner } from "sonner";
import { useLocale } from "@/i18n/client";
import { shellUi } from "@/i18n/messages/shell-ui";

export { toast } from "sonner";

export function Toaster() {
  const t = shellUi[useLocale()];
  return (
    <Sonner
      position="bottom-right"
      containerAriaLabel={t.notifications}
      closeButton
      visibleToasts={4}
      gap={8}
      toastOptions={{
        closeButtonAriaLabel: t.closeToast,
        classNames: {
          toast:
            "!rounded-md !border !border-line !bg-surface !text-ink !shadow-lg !font-sans !text-sm !gap-2.5 !px-3.5 !py-3",
          title: "!font-medium !text-ink",
          description: "!text-ink-3",
          success: "[&_[data-icon]]:!text-emerald-600",
          error: "[&_[data-icon]]:!text-negative-600",
          warning: "[&_[data-icon]]:!text-caution-700",
          info: "[&_[data-icon]]:!text-info-700",
          actionButton: "!bg-navy-800 !text-white !rounded-sm !font-medium",
          cancelButton: "!bg-sunken !text-ink-2 !rounded-sm",
          closeButton: "!border-line !bg-surface !text-ink-3 hover:!text-ink",
        },
      }}
    />
  );
}
