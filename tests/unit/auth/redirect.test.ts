import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/app/products?sort=margin")).toBe("/app/products?sort=margin");
    expect(safeNextPath("%2Fapp%2Fimports")).toBe("/app/imports");
    expect(safeNextPath("/onboarding#step-2")).toBe("/onboarding#step-2");
  });

  it.each([
    "https://evil.example",
    "//evil.example/app",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "javascript:alert(1)",
    "app",
    "/app\u0000",
    "%E0%A4%A",
  ])("rejects %j", (value) => {
    expect(safeNextPath(value)).toBe("/app");
  });

  it("uses the fallback when missing", () => {
    expect(safeNextPath(null, "/onboarding")).toBe("/onboarding");
    expect(safeNextPath(undefined)).toBe("/app");
  });
});
