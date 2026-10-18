import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origin of the Supabase project, needed by the browser auth client and for item thumbnails. */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    return [];
  }
}

/**
 * Content Security Policy without nonces, so marketing pages can stay
 * statically prerendered. React escapes all rendered values and the app does
 * not inject raw HTML, which keeps 'unsafe-inline' for Next.js bootstrap
 * scripts an acceptable trade-off. See docs/SECURITY.md.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Item thumbnails are shown through short-lived signed URLs of the Supabase project's Storage.
  `img-src 'self' blob: data: ${supabaseOrigins()[0] ?? ""}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigins().join(" ")}${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  // Server actions redirect to Stripe-hosted Checkout and the billing portal.
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  // Only when the site is served over HTTPS; a local production run on http would break itself.
  ...(!isDev && (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Off: every page now lives under /[lang], and private URLs carry no prefix, which typed routes cannot express.
  typedRoutes: false,
  // pdfkit reads its font metrics from its own package directory at runtime.
  serverExternalPackages: ["pdfkit"],
  // Fonts embedded in PDF reports and social images.
  outputFileTracingIncludes: {
    "/api/reports/**": ["./assets/fonts/**"],
    "/opengraph-image": ["./assets/fonts/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Import rows are staged in chunks well below this limit; see src/lib/imports.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Authenticated pages and exports must never be cached by shared caches.
        source: "/(app|onboarding|api)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
