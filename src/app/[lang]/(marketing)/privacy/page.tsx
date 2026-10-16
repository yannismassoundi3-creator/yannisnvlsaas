import type { Metadata } from "next";
import { NotConfigured, PageIntro, Prose } from "@/components/marketing/prose";
import { processorsFor, site } from "@/config/site";
import { publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingLegal } from "@/i18n/messages/marketing-legal";
import { getFormat, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = marketingLegal[locale].privacy;
  return { title: t.metaTitle, description: t.metaDescription, alternates: publicAlternates("/privacy", locale) };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const f = await getFormat();
  const m = marketingLegal[locale];
  const t = m.privacy;
  const controller = site.company.legalName;
  const email = site.privacyEmail;
  return (
    <>
      <PageIntro eyebrow={m.eyebrow} title={t.title}>
        <p>{m.lastUpdated(f.date(site.legalLastUpdated))}</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Prose>
          <p>{t.intro}</p>

          <h2>{t.responsibleTitle}</h2>
          <p>
            {t.controllerLead}{" "}
            {controller ? <strong>{controller}</strong> : <NotConfigured>{t.controllerMissing}</NotConfigured>}
            {site.company.address ? `, ${site.company.address}` : ""}. {t.contactLead}{" "}
            {email ? <a href={`mailto:${email}`}>{email}</a> : <NotConfigured>{t.contactMissing}</NotConfigured>}.
          </p>
          <p>{t.businessData}</p>

          <h2>{t.dataTitle}</h2>
          <table>
            <thead>
              <tr>
                <th>{t.dataHeaders.category}</th>
                <th>{t.dataHeaders.examples}</th>
                <th>{t.dataHeaders.why}</th>
              </tr>
            </thead>
            <tbody>
              {t.dataRows.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{row.examples}</td>
                  <td>{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>{t.csvTitle}</h3>
          <p>{t.csvText}</p>

          <h2>{t.providersTitle}</h2>
          <p>{t.providersIntro}</p>
          <table>
            <thead>
              <tr>
                <th>{t.providerHeaders.provider}</th>
                <th>{t.providerHeaders.purpose}</th>
                <th>{t.providerHeaders.location}</th>
              </tr>
            </thead>
            <tbody>
              {processorsFor(locale).map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.purpose}</td>
                  <td>{p.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{t.transfers}</p>

          <h2>{t.retentionTitle}</h2>
          <ul>
            {t.retention.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2 id="cookies">{t.cookiesTitle}</h2>
          <p>{t.cookiesText}</p>

          <h2>{t.rightsTitle}</h2>
          <p>{t.rightsText}</p>

          <h2>{t.securityTitle}</h2>
          <p>{t.securityText}</p>

          <h2>{t.changesTitle}</h2>
          <p>{t.changesText}</p>
        </Prose>
      </div>
    </>
  );
}
