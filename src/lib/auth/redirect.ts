/**
 * Validates a post-authentication redirect target. Only same-site relative
 * paths are allowed, which prevents open redirects such as
 * /sign-in?next=https://evil.example or //evil.example.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next) return fallback;
  let value = next;
  try {
    value = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  // Disallow scheme-like paths (/https:...) and protocol-relative after normalisation.
  try {
    const url = new URL(value, "https://narixia.invalid");
    if (url.origin !== "https://narixia.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
