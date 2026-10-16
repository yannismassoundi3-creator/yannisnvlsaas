import type { MetadataRoute } from "next";
import { site } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app/", "/api/", "/onboarding", "/auth/", "/reset-password"],
      },
    ],
    sitemap: `${site.url}/sitemap.xml`,
  };
}
