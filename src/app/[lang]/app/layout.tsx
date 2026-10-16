import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccessBanner } from "@/components/app/access-banner";
import { MobileNav } from "@/components/app/mobile-nav";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { StoreSwitcher } from "@/components/app/store-switcher";
import { UserMenu } from "@/components/app/user-menu";
import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/feedback";
import { shellLayout } from "@/i18n/messages/shell-layout";
import { getLocale } from "@/i18n/server";
import { requireWorkspace } from "@/lib/auth/workspace";

export async function generateMetadata(): Promise<Metadata> {
  const t = shellLayout[await getLocale()];
  return {
    title: { default: t.metaTitle, template: "%s · Narixia" },
    robots: { index: false, follow: false },
  };
}

async function Switcher() {
  const ws = await requireWorkspace();
  return (
    <StoreSwitcher
      stores={ws.stores.map((s) => ({ id: s.id, name: s.name, currency: s.currency, isDemo: s.is_demo }))}
      activeId={ws.activeStore?.id ?? null}
    />
  );
}

async function Account() {
  const ws = await requireWorkspace();
  return <UserMenu name={ws.user.fullName} email={ws.user.email} organization={ws.organization.name} />;
}

async function Banner() {
  const ws = await requireWorkspace();
  return <AccessBanner ws={ws} />;
}

const switcherFallback = <Skeleton className="h-[46px] w-full rounded-md" />;
const accountFallback = <Skeleton className="h-11 w-full rounded-md" />;

export default async function AppLayout({ children }: LayoutProps<"/[lang]/app">) {
  const t = shellLayout[await getLocale()];
  return (
    <div className="flex min-h-dvh">
      <a href="#app-main" className="sr-only z-50 rounded-md bg-navy-800 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {t.skipToContent}
      </a>
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-5 border-r border-line bg-ivory px-3 py-4 lg:flex">
        <Link href="/app" className="px-1.5" aria-label={t.homeLabel}>
          <Logo />
        </Link>
        <Suspense fallback={switcherFallback}>
          <Switcher />
        </Suspense>
        <SidebarNav />
        <div className="border-t border-line pt-3">
          <Suspense fallback={accountFallback}>
            <Account />
          </Suspense>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav
          storeSwitcher={
            <Suspense fallback={switcherFallback}>
              <Switcher />
            </Suspense>
          }
          userMenu={
            <Suspense fallback={accountFallback}>
              <Account />
            </Suspense>
          }
        />
        <Suspense fallback={null}>
          <Banner />
        </Suspense>
        <main id="app-main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
