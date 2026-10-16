import type { Metadata } from "next";
import { NotConfigured, PageIntro, Prose } from "@/components/marketing/prose";
import { site } from "@/config/site";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Narixia collects, uses and protects personal data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const controller = site.company.legalName;
  const email = site.privacyEmail;
  return (
    <>
      <PageIntro eyebrow="Legal" title="Privacy policy">
        <p>Last updated {formatDate(site.legalLastUpdated)}</p>
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Prose>
          <p>
            This policy explains what personal data Narixia processes, why, and the choices you have. Narixia is a
            profitability analytics service for businesses. It is designed to work without customer-level personal
            data from your store.
          </p>

          <h2>Who is responsible</h2>
          <p>
            The controller of personal data processed through Narixia is{" "}
            {controller ? <strong>{controller}</strong> : <NotConfigured>the operating company (details not configured yet)</NotConfigured>}
            {site.company.address ? `, ${site.company.address}` : ""}. Contact for privacy questions:{" "}
            {email ? <a href={`mailto:${email}`}>{email}</a> : <NotConfigured>privacy contact not configured yet</NotConfigured>}.
          </p>
          <p>
            For the business data you upload (orders, products, costs), you decide what is uploaded and why. If that
            data contains personal data, Narixia processes it on your behalf to provide the service.
          </p>

          <h2>Data we process</h2>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Examples</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account data</td>
                <td>Email address, name, password (stored as a salted hash by our authentication provider)</td>
                <td>To create and secure your account (contract)</td>
              </tr>
              <tr>
                <td>Business data you provide</td>
                <td>Store profile, products and costs, order identifiers and amounts, expenses, advertising spend</td>
                <td>To calculate your margins and reports (contract)</td>
              </tr>
              <tr>
                <td>Billing data</td>
                <td>Customer and subscription identifiers, invoices, payment status. Card details are handled by Stripe and never reach Narixia.</td>
                <td>To manage your subscription (contract) and keep accounting records (legal obligation)</td>
              </tr>
              <tr>
                <td>Security data</td>
                <td>IP address and timestamps of sign-ins and sensitive actions, rate-limit counters</td>
                <td>To protect accounts and the service (legitimate interest)</td>
              </tr>
              <tr>
                <td>Product usage events</td>
                <td>Events such as &ldquo;import completed&rdquo; with the date, linked to your account. They never contain financial amounts or file contents.</td>
                <td>To understand and improve the product (legitimate interest)</td>
              </tr>
              <tr>
                <td>Support messages</td>
                <td>Messages and feedback you send us</td>
                <td>To answer you (contract or legitimate interest)</td>
              </tr>
            </tbody>
          </table>

          <h3>CSV files</h3>
          <p>
            When you import a CSV file, it is read in your browser. Only the columns you map to Narixia fields are sent
            to our servers. Narixia&rsquo;s templates do not ask for customer names, email addresses or postal
            addresses, and we recommend not mapping such columns.
          </p>

          <h2>Service providers</h2>
          <p>We use the following processors, bound by data processing agreements:</p>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Purpose</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {site.processors.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.purpose}</td>
                  <td>{p.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Where a provider processes data outside the European Economic Area, the transfer relies on appropriate
            safeguards such as the European Commission&rsquo;s standard contractual clauses.
          </p>

          <h2>How long we keep data</h2>
          <ul>
            <li>Account and business data: for as long as your account exists.</li>
            <li>When you delete your account, your organisation&rsquo;s data is deleted from the live database immediately. Copies in encrypted backups expire with the backup rotation of our database provider.</li>
            <li>Billing records: as long as accounting and tax law requires.</li>
            <li>Security logs and usage events: up to 12 months.</li>
          </ul>

          <h2 id="cookies">Cookies</h2>
          <p>
            Narixia uses only cookies that are strictly necessary: authentication cookies that keep you signed in and
            protect your session. We do not use advertising cookies. If optional analytics are ever enabled, we will
            ask for your consent first.
          </p>

          <h2>Your rights</h2>
          <p>
            Depending on where you live, you can ask to access, correct, delete or export your personal data, object to
            or restrict certain processing, and withdraw consent at any time. You can export all of your data and delete
            your account yourself from the settings page. You also have the right to lodge a complaint with your data
            protection authority.
          </p>

          <h2>Security</h2>
          <p>
            Data is encrypted in transit. Access to your organisation&rsquo;s data is restricted to its members by
            database access policies, and administrative access is limited to what is needed to operate the service.
          </p>

          <h2>Changes</h2>
          <p>
            We will update this page when our processing changes and, for material changes, notify account holders by
            email or in the app.
          </p>
        </Prose>
      </div>
    </>
  );
}
