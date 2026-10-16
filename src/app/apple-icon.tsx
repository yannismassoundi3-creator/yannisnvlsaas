import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#172033" }}>
        <svg width="180" height="180" viewBox="0 0 32 32">
          <rect width="32" height="32" fill="#172033" />
          <rect x="8.5" y="11" width="3.5" height="13" rx="1" fill="#F8F7F4" />
          <path d="M9.3 11.7 11.9 10.9 22.6 23.4 20 24Z" fill="#F8F7F4" />
          <rect x="20" y="7" width="3.5" height="17" rx="1" fill="#2E9A7C" />
        </svg>
      </div>
    ),
    size,
  );
}
