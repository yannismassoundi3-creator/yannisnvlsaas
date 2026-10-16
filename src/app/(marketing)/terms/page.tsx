import type { Metadata } from "next";
import Link from "next/link";
import { NotConfigured, PageIntro, Prose } from "@/components/marketing/prose";
import { PAYMENT_GRACE_DAYS, TRIAL_DAYS } from "@/config/plans";
import { site } from "@/config/site";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms that apply to your use of Narixia.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const company = site.company.legalName;
  return (
    <>
      <PageIntro eyebrow="Legal" title="Terms of service">
        <p>Last updated {formatDate(site.legalLastUpdated)}</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Prose>
          <p>
            These terms form the agreement between you and{" "}
            {company ? <strong>{company}</strong> : <NotConfigured>the operating company (details not configured yet)</NotConfigured>}{" "}
            (&ldquo;Narixia&rdquo;, &ldquo;we&rdquo;) for the use of the Narixia service. By creating an account you
            accept them.
          </p>

          <h2>1. The service</h2>
          <p>
            Narixia is a web application that helps businesses analyse sales, costs, advertising and margins from data
            they provide. It is intended for business use. Narixia provides decision support; it is not accounting,
            tax, legal or financial advice, and it does not replace your accounts.
          </p>
          <p>
            Results depend on the completeness and accuracy of the data you provide. Estimated and missing values are
            labelled in the product, and you remain responsible for decisions you make based on the results.
          </p>

          <h2>2. Your account</h2>
          <ul>
            <li>You must provide accurate information and keep your password confidential.</li>
            <li>You are responsible for activity under your account and must tell us promptly about any unauthorised use.</li>
            <li>You must have the authority to accept these terms on behalf of the business you represent.</li>
          </ul>

          <h2>3. Free trial</h2>
          <p>
            New accounts receive a free trial of {TRIAL_DAYS} days. No payment card is required to start, and you are
            never charged automatically at the end of the trial. Trial accounts are subject to the limits shown on the{" "}
            <Link href="/pricing">pricing page</Link>. When the trial ends without a subscription, your data is kept and
            remains available for export, while analytics and imports are paused.
          </p>

          <h2>4. Subscriptions and payment</h2>
          <ul>
            <li>Paid plans are billed in advance for each billing period through our payment provider, Stripe.</li>
            <li>Subscriptions renew automatically until cancelled. You can cancel at any time from the billing page; cancellation takes effect at the end of the current period.</li>
            <li>Except where the law requires otherwise, payments are not refundable for partial periods.</li>
            <li>If a payment fails, we keep your access for {PAYMENT_GRACE_DAYS} days while the payment is retried. If it still fails, paid features are paused until payment succeeds.</li>
            <li>We may change prices with at least 30 days&rsquo; notice. Changes apply from the next billing period after the notice.</li>
          </ul>

          <h2>5. Your data</h2>
          <p>
            You keep all rights to the data you upload. You grant us the rights needed to host and process it in order to
            provide the service. You can export your data and delete your account at any time from the settings page.
            Our handling of personal data is described in the <Link href="/privacy">privacy policy</Link>.
          </p>
          <p>You must have the right to upload the data you provide and must not upload data you are not allowed to share.</p>

          <h2>6. Acceptable use</h2>
          <ul>
            <li>Do not attempt to access other customers&rsquo; data or to bypass security or usage limits.</li>
            <li>Do not use the service to store unlawful content or to send spam.</li>
            <li>Do not overload the service, for example with automated requests beyond normal use.</li>
          </ul>

          <h2>7. Availability and changes</h2>
          <p>
            We aim to keep Narixia available and reliable but do not guarantee uninterrupted service. We may change or
            discontinue features; if we discontinue the service, we will give reasonable notice and an opportunity to
            export your data.
          </p>

          <h2>8. Liability</h2>
          <p>
            To the extent permitted by law, our total liability arising from these terms is limited to the amounts you
            paid us in the twelve months before the event giving rise to the claim, and we are not liable for indirect
            losses such as lost profits or business decisions made using the service. Nothing in these terms limits
            liability that cannot be limited by law.
          </p>

          <h2>9. Termination</h2>
          <p>
            You can stop using Narixia and delete your account at any time. We may suspend or close accounts that breach
            these terms, after notice where reasonable.
          </p>

          <h2>10. Governing law</h2>
          <p>
            These terms are governed by the laws of{" "}
            {site.company.country ? site.company.country : <NotConfigured>the country of the operating company (not configured yet)</NotConfigured>}
            , without prejudice to mandatory protections of the law of your country.
          </p>

          <h2>11. Contact</h2>
          <p>
            Questions about these terms:{" "}
            {site.supportEmail ? <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> : <NotConfigured>contact email not configured yet</NotConfigured>}.
          </p>
        </Prose>
      </div>
    </>
  );
}
