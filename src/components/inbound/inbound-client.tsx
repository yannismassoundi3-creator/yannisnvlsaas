"use client";

import { Check, Copy, RefreshCw, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useLocale } from "@/i18n/client";
import { inboundMessages } from "@/i18n/messages/inbound";
import { dismissInboundEmail, regenerateInboundAddress } from "@/lib/inbound/actions";

/** The private address with a copy button (large, easy to select on a phone). */
export function CopyAddress({ address }: { address: string }) {
  const t = inboundMessages[useLocale()].guide;
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 rounded-md border border-line bg-sunken px-3 py-2.5 font-mono text-sm break-all text-ink select-all" data-testid="inbound-address">
        {address}
      </code>
      <Button
        variant="secondary"
        aria-label={t.copyLabel}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            toast.success(t.copied);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            toast.error(t.copyFailed);
          }
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {t.copy}
      </Button>
    </div>
  );
}

/** Replaces the address after confirmation (owners and admins). */
export function RegenerateAddressButton({ disabled }: { disabled: boolean }) {
  const t = inboundMessages[useLocale()].guide;
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="sm" disabled={disabled}>
          <RefreshCw aria-hidden />
          {t.regenerate}
        </Button>
      }
      title={t.regenerateTitle}
      description={t.regenerateBody}
      confirmLabel={t.regenerate}
      pending={pending}
      onConfirm={() =>
        new Promise<void>((resolve) =>
          startTransition(async () => {
            const r = await regenerateInboundAddress().catch(() => null);
            resolve();
            setOpen(false);
            if (!r || !r.ok) toast.error(r?.message ?? t.regenerateFailed);
            else toast.success(t.regenerated);
          }),
        )
      }
    />
  );
}

/** "Ignore" (or "Done" for a Gmail confirmation). */
export function DismissInboundButton({ id, label, ariaLabel, disabled }: { id: string; label?: string; ariaLabel?: string; disabled: boolean }) {
  const t = inboundMessages[useLocale()].inbox;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="lg"
      aria-label={ariaLabel}
      loading={pending}
      disabled={disabled}
      onClick={() =>
        startTransition(async () => {
          const r = await dismissInboundEmail(id).catch(() => null);
          if (!r || !r.ok) toast.error(r?.message ?? t.dismissFailed);
          else toast.success(t.dismissed);
        })
      }
    >
      {label ? <Check aria-hidden /> : <X aria-hidden />}
      {label ?? t.dismiss}
    </Button>
  );
}
