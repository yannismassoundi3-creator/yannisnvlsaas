import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Narixia",
    short_name: "Narixia",
    description: "Profitability analytics for small e-commerce businesses.",
    start_url: "/app",
    display: "standalone",
    background_color: "#F8F7F4",
    theme_color: "#F8F7F4",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
