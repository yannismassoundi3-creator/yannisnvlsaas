import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { shellBanners } from "@/i18n/messages/shell-banners";
import { getLocale } from "@/i18n/server";

/**
 * Shown instead of analytics once a trial or subscription has ended. Data is
 * kept and can still be exported or deleted, as promised on the pricing page.
 * `what` is the paused section in the interface language ("Product analytics",
 * « Analyses produits »); the title reads "… are paused" / « … en pause ».
 */
export async function AnalyticsPaused({ what }: { what?: string }) {
  const t = shellBanners[await getLocale()].paused;
  return (
    <div className="rounded-lg border border-line bg-surface shadow-xs">
      <EmptyState
        icon={<Lock aria-hidden />}
        title={t.title(what ?? t.defaultWhat)}
        description={t.description}
        actions={
          <>
            <Button asChild>
              <Link href="/app/billing">{t.seePlans}</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/app/settings?section=data">{t.exportOrDelete}</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
