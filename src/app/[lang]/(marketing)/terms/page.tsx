import type { Metadata } from "next";
import Link from "next/link";
import { NotConfigured, PageIntro, Prose } from "@/components/marketing/prose";
import { PAYMENT_GRACE_DAYS, TRIAL_DAYS } from "@/config/plans";
import { site } from "@/config/site";
import { localizedPath } from "@/i18n/config";
import { publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingLegal } from "@/i18n/messages/marketing-legal";
import { getFormat, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = marketingLegal[locale].terms;
  return { title: t.metaTitle, description: t.metaDescription, alternates: publicAlternates("/terms", locale) };
}

export default async function TermsPage() {
  const locale = await getLocale();
  const f = await getFormat();
  const m = marketingLegal[locale];
  const t = m.terms;
  const company = site.company.legalName;
  return (
    <>
      <PageIntro eyebrow={m.eyebrow} title={t.title}>
        <p>{m.lastUpdated(f.date(site.legalLastUpdated))}</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Prose>
          <p>
            {t.introLead}{" "}
            {company ? <strong>{company}</strong> : <NotConfigured>{t.companyMissing}</NotConfigured>} {t.introRest}
          </p>

          <h2>{t.serviceTitle}</h2>
          <p>{t.service1}</p>
          <p>{t.service2}</p>

          <h2>{t.accountTitle}</h2>
          <ul>
            {t.account.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>{t.trialTitle}</h2>
          <p>
            {t.trialLead(TRIAL_DAYS)} <Link href={localizedPath("/pricing", locale)}>{t.trialLink}</Link>
            {t.trialRest}
          </p>

          <h2>{t.paymentTitle}</h2>
          <ul>
            {t.payment(PAYMENT_GRACE_DAYS).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>{t.dataTitle}</h2>
          <p>
            {t.dataLead} <Link href={localizedPath("/privacy", locale)}>{t.dataLink}</Link>
            {t.dataRest}
          </p>
          <p>{t.dataRight}</p>

          <h2>{t.useTitle}</h2>
          <ul>
            {t.use.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>{t.availabilityTitle}</h2>
          <p>{t.availability}</p>

          <h2>{t.liabilityTitle}</h2>
          <p>{t.liability}</p>

          <h2>{t.terminationTitle}</h2>
          <p>{t.termination}</p>

          <h2>{t.lawTitle}</h2>
          <p>
            {t.lawLead} {site.company.country ? site.company.country : <NotConfigured>{t.countryMissing}</NotConfigured>}
            {t.lawRest}
          </p>

          <h2>{t.contactTitle}</h2>
          <p>
            {t.contactLead}{" "}
            {site.supportEmail ? <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> : <NotConfigured>{t.contactMissing}</NotConfigured>}.
          </p>
        </Prose>
      </div>
    </>
  );
}
