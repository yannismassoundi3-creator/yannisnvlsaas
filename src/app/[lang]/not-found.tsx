import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { localizedPath } from "@/i18n/config";
import { marketingCommon } from "@/i18n/messages/marketing-common";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = marketingCommon[await getLocale()].notFound;
  return { title: t.title, robots: { index: false } };
}

export default async function NotFound() {
  const locale = await getLocale();
  const t = marketingCommon[locale].notFound;
  const home = localizedPath("/", locale);
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-16">
      <Link href={home} aria-label={t.homeAria}>
        <Logo />
      </Link>
      <main className="mt-10 w-full max-w-[400px] rounded-lg border border-line bg-surface p-7 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-2 text-sm text-ink-2">{t.body}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link href={home}>{t.home}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app">{t.dashboard}</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
