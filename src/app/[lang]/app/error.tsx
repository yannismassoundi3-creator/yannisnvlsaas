"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/client";
import { shellLayout } from "@/i18n/messages/shell-layout";

/** Error boundary for application pages: the shell stays usable, the page can be retried. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = shellLayout[useLocale()].error;
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-lg rounded-lg border border-line bg-surface px-6 py-10 text-center shadow-xs">
      <h1 className="text-lg font-semibold text-ink">{t.title}</h1>
      <p className="mt-2 text-sm text-ink-3">{t.body}</p>
      {digest ? <p className="mt-3 text-xs text-ink-4 tabular">{t.reference(digest)}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw aria-hidden />
          {t.retry}
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/app">{t.overview}</Link>
        </Button>
      </div>
    </div>
  );
}
