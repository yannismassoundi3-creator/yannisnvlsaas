"use client";

import { CreditCard, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toaster";
import { openBillingPortal, startCheckout } from "@/lib/billing/actions";

export function SubscribeButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="accent"
      size="lg"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          // On success the action redirects to Stripe Checkout.
          const result = await startCheckout();
          if (result && !result.ok) toast.error(result.message);
        })
      }
    >
      <CreditCard aria-hidden />
      {label}
    </Button>
  );
}

export function PortalButton({ disabled }: { disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openBillingPortal();
          if (result && !result.ok) toast.error(result.message);
        })
      }
    >
      <ExternalLink aria-hidden />
      Manage billing
    </Button>
  );
}

/**
 * After returning from Checkout, waits for Stripe's webhook to confirm the
 * subscription. The page never shows Pro as active before that.
 */
export function CheckoutConfirmation({ confirmed }: { confirmed: boolean }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (confirmed) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 60_000) {
        setTimedOut(true);
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [confirmed, router]);

  if (confirmed) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-md border border-info-100 bg-info-50 px-4 py-3 text-sm text-info-700">
      {timedOut ? null : <Spinner className="mt-0.5 size-4" />}
      <div>
        <p className="font-semibold">{timedOut ? "Still waiting for confirmation" : "Confirming your subscription with Stripe…"}</p>
        <p className="text-ink-2">
          {timedOut
            ? "Stripe has not confirmed the payment yet. This can take a few minutes; reload this page later. You will not be charged twice."
            : "Pro is activated as soon as Stripe confirms the subscription. This usually takes a few seconds."}
        </p>
      </div>
    </div>
  );
}
