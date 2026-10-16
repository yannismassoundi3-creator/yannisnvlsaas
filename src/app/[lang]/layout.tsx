import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { site } from "@/config/site";
import { LOCALES, OG_LOCALE } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/client";
import { defineMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import "../globals.css";

const instrumentSans = localFont({
  src: "../fonts/InstrumentSans-Variable.woff2",
  variable: "--font-instrument-sans",
  weight: "400 700",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const m = defineMessages({
  en: {
    title: "Narixia — Profitability analytics for e-commerce",
    description: site.description,
  },
  fr: {
    title: "Narixia — Analyse de rentabilité pour l'e-commerce",
    description:
      "Analyse de rentabilité pour les petites boutiques en ligne. Voyez vos vraies marges par produit, la performance de vos publicités et vos coûts d'exploitation en un coup d'œil.",
  },
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = m[locale];
  return {
    metadataBase: new URL(site.url),
    title: { default: t.title, template: "%s · Narixia" },
    description: t.description,
    applicationName: site.name,
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      url: locale === "en" ? "/" : `/${locale}`,
      title: t.title,
      description: t.description,
    },
    twitter: { card: "summary_large_image", title: t.title, description: t.description },
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#F8F7F4",
  colorScheme: "light",
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={instrumentSans.variable}>
      <body className="min-h-dvh bg-ivory font-sans text-ink antialiased">
        <LocaleProvider locale={locale}>
          <Providers>{children}</Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
