import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { site, siteCopy } from "@/config/site";
import { localizedPath, type Locale } from "@/i18n/config";
import { marketingCommon } from "@/i18n/messages/marketing-common";

export function SiteFooter({ locale }: { locale: Locale }) {
  const { company } = site;
  const t = marketingCommon[locale].footer;
  const columns: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: t.product,
      links: [
        { label: t.features, href: "/#features" },
        { label: t.pricing, href: "/pricing" },
        { label: t.calculator, href: "/tools/profit-margin-calculator" },
        { label: t.glossary, href: "/glossary" },
      ],
    },
    {
      title: t.company,
      links: [
        { label: t.contact, href: "/contact" },
        { label: t.legalNotice, href: "/legal" },
      ],
    },
    {
      title: t.legal,
      links: [
        { label: t.privacy, href: "/privacy" },
        { label: t.terms, href: "/terms" },
        { label: t.cookies, href: "/privacy#cookies" },
      ],
    },
  ];
  return (
    <footer className="border-t border-line bg-ivory">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-ink-3">{siteCopy(locale).tagline}</p>
          <LanguageSwitcher locale={locale} className="pt-1" />
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link href={localizedPath(link.href, locale)} className="text-sm text-ink-3 transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-ink-3 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>
            {company.legalName ? (
              <>
                © {company.legalName}
                {company.address ? ` · ${company.address}` : ""}
                {company.registration ? ` · ${company.registration}` : ""}
              </>
            ) : (
              <>{t.companyFallback}</>
            )}
          </p>
          <p>{t.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
