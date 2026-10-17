import type { Route } from "next";
import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { track } from "@/lib/analytics/track";
import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Landing point for links in authentication emails. Supports the token_hash
 * flow (works across devices) and the PKCE code flow. Only same-site
 * relative redirects are honoured.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const fallback = type === "recovery" ? "/reset-password" : "/onboarding";
  const next = safeNextPath(params.get("next"), fallback);

  const supabase = await createClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      if (type === "signup" || type === "email") track("registration_completed", { userId: data.user?.id ?? null });
      redirect(next as Route);
    }
    redirect(`/auth/error?reason=${error.code === "otp_expired" ? "expired" : "invalid"}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next as Route);
    // Supabase only redirects here with a code after verifying the email link. The
    // exchange fails when the link is opened in another browser (no PKCE verifier
    // cookie): a sign-up is then confirmed, and the user only needs to sign in.
    redirect(`/auth/error?reason=${next === "/onboarding" ? "confirmed" : "invalid"}`);
  }

  redirect("/auth/error?reason=missing");
}
