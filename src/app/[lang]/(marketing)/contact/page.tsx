import { LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotConfigured, PageIntro } from "@/components/marketing/prose";
import { site } from "@/config/site";
import { localizedPath } from "@/i18n/config";
import { publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingPages } from "@/i18n/messages/marketing-pages";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = marketingPages[locale].contact;
  return { title: t.metaTitle, description: t.metaDescription, alternates: publicAlternates("/contact", locale) };
}

export default async function ContactPage() {
  const locale = await getLocale();
  const t = marketingPages[locale].contact;
  const cards = [
    {
      icon: <Mail />,
      title: t.general,
      body: site.supportEmail ? (
        <a href={`mailto:${site.supportEmail}`} className="font-medium text-emerald-700 hover:underline">
          {site.supportEmail}
        </a>
      ) : (
        <NotConfigured>{t.supportMissing}</NotConfigured>
      ),
    },
    {
      icon: <LifeBuoy />,
      title: t.customer,
      body: (
        <>
          {t.customerUse} <strong className="font-medium text-ink">{t.helpMenu}</strong> {t.customerRest}
        </>
      ),
    },
    {
      icon: <ShieldCheck />,
      title: t.privacy,
      body: site.privacyEmail ? (
        <a href={`mailto:${site.privacyEmail}`} className="font-medium text-emerald-700 hover:underline">
          {site.privacyEmail}
        </a>
      ) : (
        <>
          {t.privacySee}{" "}
          <Link href={localizedPath("/privacy", locale)} className="font-medium text-emerald-700 hover:underline">
            {t.privacyLink}
          </Link>
          .
        </>
      ),
    },
  ];
  return (
    <>
      <PageIntro eyebrow={t.eyebrow} title={t.title}>
        <p>{t.intro}</p>
      </PageIntro>
      <div className="mx-auto grid max-w-6xl gap-5 px-4 pb-20 sm:px-6 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-lg border border-line bg-surface p-6 shadow-xs">
            <span className="flex size-9 items-center justify-center rounded-md bg-sunken text-ink-2 [&_svg]:size-4" aria-hidden>
              {c.icon}
            </span>
            <h2 className="mt-4 font-semibold text-ink">{c.title}</h2>
            <div className="mt-1 text-sm text-ink-2">{c.body}</div>
          </div>
        ))}
      </div>
    </>
  );
}
