import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Narixia — Know your margins. Grow with confidence.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const regular = await readFile(join(process.cwd(), "assets/fonts/InstrumentSans-Regular.ttf"));
const semibold = await readFile(join(process.cwd(), "assets/fonts/InstrumentSans-SemiBold.ttf"));

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#F8F7F4",
          padding: "72px 80px",
          fontFamily: "Instrument Sans",
          color: "#172033",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#172033" />
            <rect x="8.5" y="11" width="3.5" height="13" rx="1" fill="#F8F7F4" />
            <path d="M9.3 11.7 11.9 10.9 22.6 23.4 20 24Z" fill="#F8F7F4" />
            <rect x="20" y="7" width="3.5" height="17" rx="1" fill="#2E9A7C" />
          </svg>
          <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.01em" }}>Narixia</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 600, lineHeight: 1.04, letterSpacing: "-0.035em", display: "flex", flexDirection: "column" }}>
            <span>Know your margins.</span>
            <span>Grow with confidence.</span>
          </div>
          <div style={{ fontSize: 30, color: "#464E60", lineHeight: 1.35 }}>
            One clear view of your sales, product costs, and advertising performance.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: "#1A6E57" }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: "#21866B" }} />
          Profitability analytics for e-commerce
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Instrument Sans", data: regular, weight: 400, style: "normal" },
        { name: "Instrument Sans", data: semibold, weight: 600, style: "normal" },
      ],
    },
  );
}
