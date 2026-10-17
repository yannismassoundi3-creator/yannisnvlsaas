import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { localizedPath, type Locale } from "@/i18n/config";
import { authPageMessages } from "@/i18n/messages/auth-pages";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = authPageMessages[await getLocale()].linkError;
  return { title: t.metaTitle, robots: { index: false } };
}

const REASONS = ["expired", "invalid", "missing", "confirmed"] as const;

async function Message({ searchParams, locale }: { searchParams: Promise<{ reason?: string }>; locale: Locale }) {
  const { reason } = await searchParams;
  const t = authPageMessages[locale].linkError;
  const m = t[REASONS.find((r) => r === reason) ?? "invalid"];
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{m.title}</h1>
      <p className="mt-2 text-sm text-ink-2">{m.body}</p>
    </>
  );
}

export default async function AuthErrorPage(props: PageProps<"/[lang]/auth/error">) {
  const locale = await getLocale();
  const t = authPageMessages[locale];
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-16">
      <Link href={localizedPath("/", locale)} aria-label={t.layout.home}>
        <Logo />
      </Link>
      <div className="mt-10 w-full max-w-[400px] rounded-lg border border-line bg-surface p-7 shadow-sm">
        <Suspense fallback={<div className="h-14" />}>
          <Message searchParams={props.searchParams as Promise<{ reason?: string }>} locale={locale} />
        </Suspense>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link href="/sign-in">{t.linkError.signIn}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/forgot-password">{t.linkError.resetPassword}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
