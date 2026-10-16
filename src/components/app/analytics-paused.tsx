import { Lock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

/**
 * Shown instead of analytics once a trial or subscription has ended. Data is
 * kept and can still be exported or deleted, as promised on the pricing page.
 */
export function AnalyticsPaused({ what = "Dashboards and reports" }: { what?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface shadow-xs">
      <EmptyState
        icon={<Lock aria-hidden />}
        title={`${what} are paused`}
        description="Your free trial or subscription has ended. Your data is kept: you can still export it or delete it from Settings. Subscribe to Pro to pick up where you left off."
        actions={
          <>
            <Button asChild>
              <Link href="/app/billing">See plans</Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/app/settings?section=data">Export or delete data</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
