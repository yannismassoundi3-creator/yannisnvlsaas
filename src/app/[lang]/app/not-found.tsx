import Link from "next/link";
import { Button } from "@/components/ui/button";
import { shellLayout } from "@/i18n/messages/shell-layout";
import { getLocale } from "@/i18n/server";

/** Shown inside the application shell for unknown records (e.g. a deleted product or another store's order). */
export default async function AppNotFound() {
  const t = shellLayout[await getLocale()].notFound;
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-line bg-surface px-6 py-10 text-center shadow-xs">
      <h1 className="text-lg font-semibold text-ink">{t.title}</h1>
      <p className="mt-2 text-sm text-ink-3">{t.body}</p>
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" asChild>
          <Link href="/app">{t.overview}</Link>
        </Button>
      </div>
    </div>
  );
}
