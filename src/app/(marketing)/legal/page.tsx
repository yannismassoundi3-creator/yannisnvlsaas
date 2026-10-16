import type { Metadata } from "next";
import { NotConfigured, PageIntro, Prose } from "@/components/marketing/prose";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Legal notice",
  description: "Company information for Narixia.",
  alternates: { canonical: "/legal" },
};

export default function LegalNoticePage() {
  const c = site.company;
  const missing = <NotConfigured>Not configured yet</NotConfigured>;
  return (
    <>
      <PageIntro eyebrow="Legal" title="Legal notice" />
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Prose>
          <table>
            <tbody>
              <tr>
                <th>Company</th>
                <td>{c.legalName ?? missing}</td>
              </tr>
              <tr>
                <th>Registered address</th>
                <td>{c.address ?? missing}</td>
              </tr>
              <tr>
                <th>Registration</th>
                <td>{c.registration ?? missing}</td>
              </tr>
              <tr>
                <th>Contact</th>
                <td>{site.supportEmail ? <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> : missing}</td>
              </tr>
              <tr>
                <th>Hosting</th>
                <td>
                  {site.processors
                    .filter((p) => p.purpose.startsWith("Application hosting"))
                    .map((p) => p.name)
                    .join(", ")}
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            Narixia is a decision-support tool. Figures shown in the product are calculated from data provided by its
            users and do not constitute accounting, tax or financial advice.
          </p>
        </Prose>
      </div>
    </>
  );
}
