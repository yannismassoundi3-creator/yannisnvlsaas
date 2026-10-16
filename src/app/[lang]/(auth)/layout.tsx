import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { localizedPath } from "@/i18n/config";
import { authPageMessages } from "@/i18n/messages/auth-pages";
import { getLocale } from "@/i18n/server";

export default async function AuthLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const t = authPageMessages[locale].layout;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
        <Link href={localizedPath("/", locale)} aria-label={t.home} className="rounded-sm">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-8 text-xs text-ink-3 sm:px-6">
        <Link href={localizedPath("/privacy", locale)} className="hover:text-ink">
          {t.privacy}
        </Link>
        <Link href={localizedPath("/terms", locale)} className="hover:text-ink">
          {t.terms}
        </Link>
        <Link href={localizedPath("/contact", locale)} className="hover:text-ink">
          {t.contact}
        </Link>
      </footer>
    </div>
  );
}
