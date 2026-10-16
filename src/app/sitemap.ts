import type { MetadataRoute } from "next";
import { site } from "@/config/site";

/** Public, indexable pages only. The application and auth pages are excluded. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/tools/profit-margin-calculator", priority: 0.8, changeFrequency: "monthly" },
    { path: "/glossary", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
    { path: "/legal", priority: 0.2, changeFrequency: "yearly" },
  ];
  return pages.map((p) => ({
    url: `${site.url}${p.path === "/" ? "" : p.path}`,
    lastModified: site.legalLastUpdated,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
