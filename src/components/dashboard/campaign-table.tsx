"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TermTip } from "@/components/ui/overlay";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { createFormat } from "@/i18n/format";
import { dashboardMessages } from "@/i18n/messages/dashboard-components";
import type { CampaignRow } from "@/lib/analytics/reference";
import { platformLabel, type Platform } from "@/lib/domain/types";
import { definitionsFor } from "@/lib/finance/metrics";

type Props = {
  campaigns: CampaignRow[];
  currency: string;
  breakEvenRoas: number | null;
  productNames?: Record<string, string>;
  compact?: boolean;
  /** Interface language; defaults to the current one. */
  locale?: Locale;
};

export function CampaignTable({ campaigns, currency, breakEvenRoas, productNames = {}, compact = false, locale: localeProp }: Props) {
  const contextLocale = useLocale();
  const locale = localeProp ?? contextLocale;
  const t = dashboardMessages[locale].campaignTable;
  const f = createFormat(locale);
  const roas = definitionsFor(locale).roas;
  return (
    <TableContainer>
      <Table>
        <caption className="sr-only">{t.caption}</caption>
        <THead>
          <TR>
            <TH>{t.campaign}</TH>
            <TH numeric>{t.spend}</TH>
            {!compact ? <TH numeric>{t.clicks}</TH> : null}
            {!compact ? <TH numeric>{t.conversionValue}</TH> : null}
            <TH numeric>
              <span className="inline-flex items-center gap-1">
                {t.platformRoas}
                <TermTip term={roas.term}>{roas.short}</TermTip>
              </span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {campaigns.map((c) => {
            const below = breakEvenRoas !== null && c.platformRoas !== null && c.platformRoas < breakEvenRoas;
            return (
              <TR key={c.campaignId} className="hover:bg-hover/60">
                <TD className="max-w-72">
                  <div className="truncate font-medium text-ink">{c.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-3">
                    {platformLabel(c.platform as Platform, locale) ?? c.platform}
                    {c.productId && productNames[c.productId] ? <span>{t.promotes(productNames[c.productId])}</span> : null}
                  </div>
                </TD>
                <TD numeric>{f.money(c.spend, currency)}</TD>
                {!compact ? <TD numeric>{f.count(c.clicks)}</TD> : null}
                {!compact ? <TD numeric>{f.money(c.conversionValue, currency)}</TD> : null}
                <TD numeric>
                  <span className="inline-flex items-center justify-end gap-2">
                    {below ? (
                      <Badge tone="caution">
                        <AlertTriangle aria-hidden />
                        {t.belowBreakEven}
                      </Badge>
                    ) : null}
                    <span className="font-medium">{f.multiple(c.platformRoas)}</span>
                  </span>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableContainer>
  );
}
