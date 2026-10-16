import { SiteFooter } from "@/components/marketing/site-footer";
import { Suspense } from "react";
import { AccountDeletedNotice } from "@/components/marketing/account-notice";
import { SiteHeader } from "@/components/marketing/site-header";
import { marketingCommon } from "@/i18n/messages/marketing-common";
import { getLocale } from "@/i18n/server";

export default async function MarketingLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const t = marketingCommon[locale];
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-navy-800 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t.skipToContent}
      </a>
      <SiteHeader />
      <Suspense fallback={null}>
        <AccountDeletedNotice />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
