import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { localizedPath, type PublicPath } from "@/i18n/config";

/** Public, indexable pages in both languages, with hreflang alternates. Application and auth pages are excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: PublicPath; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/tools/profit-margin-calculator", priority: 0.8, changeFrequency: "monthly" },
    { path: "/glossary", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
    { path: "/legal", priority: 0.2, changeFrequency: "yearly" },
  ];
  const url = (path: string) => `${site.url}${path === "/" ? "" : path}`;
  return pages.flatMap((p) => {
    const languages = { en: url(localizedPath(p.path, "en")), fr: url(localizedPath(p.path, "fr")), "x-default": url(p.path) };
    return (["en", "fr"] as const).map((locale) => ({
      url: url(localizedPath(p.path, locale)),
      lastModified: site.legalLastUpdated,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      alternates: { languages },
    }));
  });
}
