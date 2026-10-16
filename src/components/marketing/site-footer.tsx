import Link from "next/link";
import type { Route } from "next";
import { Logo } from "@/components/brand/logo";
import { site } from "@/config/site";

const COLUMNS: { title: string; links: { label: string; href: Route }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" as Route },
      { label: "Pricing", href: "/pricing" },
      { label: "Margin calculator", href: "/tools/profit-margin-calculator" as Route },
      { label: "Metric glossary", href: "/glossary" as Route },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "/contact" as Route },
      { label: "Legal notice", href: "/legal" as Route },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" as Route },
      { label: "Terms of service", href: "/terms" as Route },
      { label: "Cookies", href: "/privacy#cookies" as Route },
    ],
  },
];

export function SiteFooter() {
  const { company } = site;
  return (
    <footer className="border-t border-line bg-ivory">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-ink-3">{site.tagline}</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold text-ink">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-ink-3 transition-colors hover:text-ink">
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
              <>© Narixia. Company details are published in the legal notice.</>
            )}
          </p>
          <p>Narixia provides decision support, not accounting, tax or financial advice.</p>
        </div>
      </div>
    </footer>
  );
}
