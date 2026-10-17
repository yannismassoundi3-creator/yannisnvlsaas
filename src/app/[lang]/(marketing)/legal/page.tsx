import type { Metadata } from "next";
import { NotConfigured, PageIntro, Prose } from "@/components/marketing/prose";
import { site } from "@/config/site";
import { publicAlternates } from "@/i18n/messages/marketing-common";
import { marketingLegal } from "@/i18n/messages/marketing-legal";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = marketingLegal[locale].notice;
  return { title: t.metaTitle, description: t.metaDescription, alternates: publicAlternates("/legal", locale) };
}

export default async function LegalNoticePage() {
  const locale = await getLocale();
  const m = marketingLegal[locale];
  const t = m.notice;
  const c = site.company;
  const missing = <NotConfigured>{t.notConfigured}</NotConfigured>;
  return (
    <>
      <PageIntro eyebrow={m.eyebrow} title={t.title} />
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Prose>
          <table>
            <tbody>
              <tr>
                <th>{t.company}</th>
                <td>{c.legalName ?? missing}</td>
              </tr>
              <tr>
                <th>{t.address}</th>
                <td>{c.address ?? missing}</td>
              </tr>
              {/* Shown only once there is one: an individual founder awaiting a SIRET has no registration yet. */}
              {c.registration ? (
                <tr>
                  <th>{t.registration}</th>
                  <td>{c.registration}</td>
                </tr>
              ) : null}
              <tr>
                <th>{t.contact}</th>
                <td>{site.supportEmail ? <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> : missing}</td>
              </tr>
              <tr>
                <th>{t.hosting}</th>
                <td>
                  {site.processors
                    .filter((p) => p.id === "hosting")
                    .map((p) => p.name)
                    .join(", ")}
                </td>
              </tr>
            </tbody>
          </table>
          <p>{t.disclaimer}</p>
        </Prose>
      </div>
    </>
  );
}
