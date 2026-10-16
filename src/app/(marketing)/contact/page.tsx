import { LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotConfigured, PageIntro } from "@/components/marketing/prose";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the Narixia team.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const cards = [
    {
      icon: <Mail />,
      title: "General questions",
      body: site.supportEmail ? (
        <a href={`mailto:${site.supportEmail}`} className="font-medium text-emerald-700 hover:underline">
          {site.supportEmail}
        </a>
      ) : (
        <NotConfigured>Support email not configured yet</NotConfigured>
      ),
    },
    {
      icon: <LifeBuoy />,
      title: "Already a customer?",
      body: (
        <>
          Use <strong className="font-medium text-ink">Help &amp; feedback</strong> in the app menu. Your message reaches
          us with your account context, without sharing financial data.
        </>
      ),
    },
    {
      icon: <ShieldCheck />,
      title: "Privacy requests",
      body: site.privacyEmail ? (
        <a href={`mailto:${site.privacyEmail}`} className="font-medium text-emerald-700 hover:underline">
          {site.privacyEmail}
        </a>
      ) : (
        <>
          See the <Link href="/privacy" className="font-medium text-emerald-700 hover:underline">privacy policy</Link>.
        </>
      ),
    },
  ];
  return (
    <>
      <PageIntro eyebrow="Contact" title="Talk to us">
        <p>Questions about Narixia, your account or your data. We read every message.</p>
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
