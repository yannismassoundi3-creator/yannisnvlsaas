import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ResendConfirmation } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default function CheckEmailPage() {
  return (
    <AuthCard
      title="Confirm your email address"
      description={
        <span className="flex items-start gap-2">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          Open the link in the email we just sent to activate your account and start your trial. You can open it on any
          device.
        </span>
      }
      footer={
        <Link href="/sign-in" className="font-medium text-emerald-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Suspense fallback={null}>
        <ResendConfirmation />
      </Suspense>
      <p className="mt-5 text-xs text-ink-3">
        No email after a few minutes? Check your spam folder, or make sure the address is correct.
      </p>
    </AuthCard>
  );
}
