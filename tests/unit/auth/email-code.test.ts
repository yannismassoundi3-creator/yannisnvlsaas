import { describe, expect, it } from "vitest";
import { isCodeComplete } from "@/components/auth/email-code";

describe("isCodeComplete", () => {
  it("accepts the 6 to 10 digit codes Supabase can be configured to send", () => {
    expect(isCodeComplete("123456")).toBe(true);
    expect(isCodeComplete("38885873")).toBe(true);
    expect(isCodeComplete("1234567890")).toBe(true);
  });

  it("rejects codes that are too short or too long", () => {
    expect(isCodeComplete("12345")).toBe(false);
    expect(isCodeComplete("12345678901")).toBe(false);
  });
});
