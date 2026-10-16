import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only routes that depend on the session. Marketing pages stay fully static,
  // and the Stripe webhook is never touched.
  matcher: [
    "/app/:path*",
    "/onboarding/:path*",
    "/onboarding",
    "/sign-in",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/auth/:path*",
    "/api/exports/:path*",
    "/api/reports/:path*",
    "/api/account/:path*",
    "/api/imports/:path*",
  ],
};
