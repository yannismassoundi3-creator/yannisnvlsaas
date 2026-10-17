import { Mail } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import type { Locale } from "@/i18n/config";
import { inboundMessages } from "@/i18n/messages/inbound";
import { CopyAddress, RegenerateAddressButton } from "./inbound-client";

/**
 * "Receive my sales automatically": the store's private address with a copy
 * button and step-by-step Gmail instructions. Says "coming soon" when the
 * inbound provider is not configured.
 */
export function InboundGuide({
  address,
  locale,
  canRegenerate,
  disabled,
  showInboxLink = false,
  headingId = "inbound-guide",
}: {
  /** null when the feature is not configured. */
  address: string | null;
  locale: Locale;
  canRegenerate: boolean;
  disabled: boolean;
  showInboxLink?: boolean;
  headingId?: string;
}) {
  const t = inboundMessages[locale].guide;
  return (
    <Card aria-labelledby={headingId}>
      <CardHeader id={headingId} title={t.title} description={t.intro} />
      <CardBody className="space-y-5">
        {address === null ? (
          <Alert tone="info">{t.comingSoon}</Alert>
        ) : (
          <>
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <Mail className="size-4 text-ink-3" aria-hidden />
                {t.addressLabel}
              </p>
              <CopyAddress address={address} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-3">{t.privateNote}</p>
                {canRegenerate ? <RegenerateAddressButton disabled={disabled} /> : null}
              </div>
            </div>
            <div>
              <h3 className="text-md font-semibold tracking-tight text-ink">{t.gmailTitle}</h3>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-ink-2 marker:text-ink-3">
                {t.gmailSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-ink-3">{t.menusMayVary}</p>
            </div>
            <ul className="space-y-1.5 text-sm text-ink-2">
              <li>{t.notSales}</li>
              <li>{t.otherMail}</li>
            </ul>
            <p className="text-xs text-ink-3">{t.privacy}</p>
            {showInboxLink ? (
              <Link href={"/app/inbox" as Route} className="inline-block text-sm font-medium text-emerald-700 hover:underline">
                {t.openInbox}
              </Link>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
