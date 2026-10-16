import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TermTip } from "@/components/ui/overlay";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { CampaignRow } from "@/lib/analytics/reference";
import { PLATFORM_LABELS, type Platform } from "@/lib/domain/types";
import { formatCount, formatMultiple } from "@/lib/finance/format";
import { DEFINITIONS } from "@/lib/finance/metrics";
import { formatMoney } from "@/lib/finance/money";

type Props = {
  campaigns: CampaignRow[];
  currency: string;
  breakEvenRoas: number | null;
  productNames?: Record<string, string>;
  compact?: boolean;
};

export function CampaignTable({ campaigns, currency, breakEvenRoas, productNames = {}, compact = false }: Props) {
  return (
    <TableContainer>
      <Table>
        <caption className="sr-only">Campaign performance</caption>
        <THead>
          <TR>
            <TH>Campaign</TH>
            <TH numeric>Spend</TH>
            {!compact ? <TH numeric>Clicks</TH> : null}
            <TH numeric>Platform conversion value</TH>
            <TH numeric>
              <span className="inline-flex items-center gap-1">
                Platform ROAS
                <TermTip term={DEFINITIONS.roas.term}>{DEFINITIONS.roas.short}</TermTip>
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
                    {PLATFORM_LABELS[c.platform as Platform] ?? c.platform}
                    {c.productId && productNames[c.productId] ? <span>· Promotes {productNames[c.productId]}</span> : null}
                  </div>
                </TD>
                <TD numeric>{formatMoney(c.spend, currency)}</TD>
                {!compact ? <TD numeric>{formatCount(c.clicks)}</TD> : null}
                <TD numeric>{formatMoney(c.conversionValue, currency)}</TD>
                <TD numeric>
                  <span className="inline-flex items-center justify-end gap-2">
                    {below ? (
                      <Badge tone="caution">
                        <AlertTriangle aria-hidden />
                        Below break-even
                      </Badge>
                    ) : null}
                    <span className="font-medium">{formatMultiple(c.platformRoas)}</span>
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
